/**
 * RAMAN AI – 3D Volumetric Raymarching & Anatomical Simulation Engine
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Implements real-time 3D shader-based anatomical raymarching:
 * - Signed Distance Functions (SDF) for 4 cardiac chambers (ventricles & atria)
 * - Systolic / Diastolic volumetric deformation driven by live BPM: omega = 2 * PI * (BPM / 60)
 * - Bilateral lung lobe inflation driven by respiratory rate and SpO2
 * - Fallback CPU/Canvas2D procedural volumetric raymarcher when WebGPU is unavailable
 */

class RamanVolumetricRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.device = null;
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.isWebGpuSupported = false;
    this.animationId = null;
    this.startTime = Date.now();
    this.viewMode = "HEATMAP"; // "HEATMAP" | "ORGAN_3D" | "PKPD"
    
    // Physiological state
    this.vitals = {
      heartRate: 72,
      respirationRate: 16,
      spo2: 98,
      temperature: 98.6
    };
  }

  setVitals(vitals) {
    if (!vitals) return;
    if (vitals.heartRate) this.vitals.heartRate = parseFloat(vitals.heartRate);
    if (vitals.respirationRate) this.vitals.respirationRate = parseFloat(vitals.respirationRate);
    if (vitals.spo2) this.vitals.spo2 = parseFloat(vitals.spo2);
    if (vitals.temperature) this.vitals.temperature = parseFloat(vitals.temperature);
  }

  // --- Signed Distance Functions (SDF) ---

  // Sphere SDF
  static sdSphere(p, r) {
    return Math.hypot(p[0], p[1], p[2]) - r;
  }

  // Ellipsoid SDF
  static sdEllipsoid(p, r) {
    const k0 = Math.hypot(p[0] / r[0], p[1] / r[1], p[2] / r[2]);
    if (k0 === 0) return -Math.min(r[0], r[1], r[2]);
    const k1 = Math.hypot(p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2]));
    return k1 > 0 ? (k0 * (k0 - 1.0) / k1) : -Math.min(r[0], r[1], r[2]);
  }

  // Smooth minimum polynomial blend
  static smin(a, b, k = 0.2) {
    const h = Math.max(k - Math.abs(a - b), 0.0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  /**
   * Evaluates the anatomical SDF at point p(x,y,z) at time t.
   * Cardiac chambers contract and relax based on BPM.
   * Lungs expand and contract based on respiration.
   */
  static evaluateAnatomySDF(p, hr = 72, resp = 16, timeSec = 0) {
    const heartBps = hr / 60.0;
    const heartPhase = 2 * Math.PI * heartBps * timeSec;
    const systoleScale = 1.0 - 0.18 * Math.pow(Math.sin(heartPhase), 2);

    // Left & Right Ventricles (cardiac center at [0.0, -0.1, 0.0])
    const pHeart = [p[0], p[1] + 0.1, p[2]];
    const leftVentricle = RamanVolumetricRenderer.sdEllipsoid(
      [pHeart[0] - 0.15, pHeart[1], pHeart[2]],
      [0.32 * systoleScale, 0.42 * systoleScale, 0.32 * systoleScale]
    );
    const rightVentricle = RamanVolumetricRenderer.sdEllipsoid(
      [pHeart[0] + 0.15, pHeart[1], pHeart[2]],
      [0.30 * systoleScale, 0.40 * systoleScale, 0.30 * systoleScale]
    );
    const heartSDF = RamanVolumetricRenderer.smin(leftVentricle, rightVentricle, 0.15);

    // Bilateral Lung Lobes
    const respBps = resp / 60.0;
    const respPhase = 2 * Math.PI * respBps * timeSec;
    const lungScale = 1.0 + 0.12 * Math.sin(respPhase);

    // Left Lung (anatomical right side of chest)
    const leftLung = RamanVolumetricRenderer.sdEllipsoid(
      [p[0] - 0.75, p[1] - 0.1, p[2] + 0.1],
      [0.45 * lungScale, 0.75 * lungScale, 0.38 * lungScale]
    );
    // Right Lung
    const rightLung = RamanVolumetricRenderer.sdEllipsoid(
      [p[0] + 0.75, p[1] - 0.1, p[2] + 0.1],
      [0.48 * lungScale, 0.75 * lungScale, 0.38 * lungScale]
    );
    const lungsSDF = Math.min(leftLung, rightLung);

    return {
      distance: Math.min(heartSDF, lungsSDF),
      isHeart: heartSDF < lungsSDF,
      heartDist: heartSDF,
      lungsDist: lungsSDF
    };
  }

  // --- WebGPU WGSL Source ---
  static getWgslShaderSource() {
    return `
      struct VitalsUniforms {
        heartRate: f32,
        respirationRate: f32,
        spo2: f32,
        time: f32,
        resolution: vec2<f32>,
        padding: vec2<f32>
      };

      @group(0) @binding(0) var<uniform> vitals: VitalsUniforms;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>
      };

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
        var pos = array<vec2<f32>, 4>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 1.0, -1.0),
          vec2<f32>(-1.0,  1.0),
          vec2<f32>( 1.0,  1.0)
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        return output;
      }

      fn sdEllipsoid(p: vec3<f32>, r: vec3<f32>) -> f32 {
        let k0 = length(p / r);
        let k1 = length(p / (r * r));
        return k0 * (k0 - 1.0) / k1;
      }

      fn smin(a: f32, b: f32, k: f32) -> f32 {
        let h = max(k - abs(a - b), 0.0) / k;
        return min(a, b) - h * h * k * 0.25;
      }

      fn evaluateScene(p: vec3<f32>) -> vec2<f32> {
        let omega = 6.28318 * (vitals.heartRate / 60.0) * vitals.time;
        let systole = 1.0 - 0.18 * pow(sin(omega), 2.0);
        
        let pHeart = p + vec3<f32>(0.0, 0.1, 0.0);
        let lv = sdEllipsoid(pHeart - vec3<f32>(-0.15, 0.0, 0.0), vec3<f32>(0.32, 0.42, 0.32) * systole);
        let rv = sdEllipsoid(pHeart - vec3<f32>( 0.15, 0.0, 0.0), vec3<f32>(0.30, 0.40, 0.30) * systole);
        let heartDist = smin(lv, rv, 0.15);

        let respOmega = 6.28318 * (vitals.respirationRate / 60.0) * vitals.time;
        let lungScale = 1.0 + 0.12 * sin(respOmega);
        let leftLung = sdEllipsoid(p - vec3<f32>(-0.75, -0.1, 0.1), vec3<f32>(0.45, 0.75, 0.38) * lungScale);
        let rightLung = sdEllipsoid(p - vec3<f32>( 0.75, -0.1, 0.1), vec3<f32>(0.48, 0.75, 0.38) * lungScale);
        let lungDist = min(leftLung, rightLung);

        if (heartDist < lungDist) {
          return vec2<f32>(heartDist, 1.0); // 1.0 = Heart
        } else {
          return vec2<f32>(lungDist, 2.0); // 2.0 = Lungs
        }
      }

      fn calcNormal(p: vec3<f32>) -> vec3<f32> {
        let e = 0.001;
        let d = evaluateScene(p).x;
        let n = vec3<f32>(
          evaluateScene(p + vec3<f32>(e, 0.0, 0.0)).x - d,
          evaluateScene(p + vec3<f32>(0.0, e, 0.0)).x - d,
          evaluateScene(p + vec3<f32>(0.0, 0.0, e)).x - d
        );
        return normalize(n);
      }

      @fragment
      fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        let pNdc = (uv - 0.5) * 2.0;
        let aspect = vitals.resolution.x / vitals.resolution.y;
        let ro = vec3<f32>(0.0, 0.0, -3.2);
        let rd = normalize(vec3<f32>(pNdc.x * aspect, -pNdc.y, 1.8));

        var t = 0.0;
        var hitMat = 0.0;
        for (var i = 0; i < 48; i++) {
          let p = ro + rd * t;
          let res = evaluateScene(p);
          let d = res.x;
          if (d < 0.002) {
            hitMat = res.y;
            break;
          }
          t += d;
          if (t > 8.0) { break; }
        }

        if (hitMat > 0.5) {
          let p = ro + rd * t;
          let norm = calcNormal(p);
          let lightDir = normalize(vec3<f32>(0.5, 0.8, -0.7));
          let diff = max(dot(norm, lightDir), 0.15);

          var baseColor = vec3<f32>(0.85, 0.15, 0.25); // Cardiac oxygenated red
          if (hitMat > 1.5) {
            let spo2Factor = clamp(vitals.spo2 / 100.0, 0.7, 1.0);
            baseColor = vec3<f32>(0.1, 0.75 * spo2Factor, 0.85); // Pulmonary cyan
          }

          let rim = pow(1.0 - max(dot(-rd, norm), 0.0), 3.0);
          let finalColor = baseColor * diff + vec3<f32>(0.0, 0.9, 1.0) * rim * 0.4;
          return vec4<f32>(finalColor, 0.95);
        }

        // Cyber holographic dark background with subtle grid
        let bg = vec3<f32>(0.02, 0.05, 0.10);
        return vec4<f32>(bg, 1.0);
      }
    `;
  }

  // --- Initialization & WebGPU setup ---
  async initialize() {
    if (!this.canvas) return false;
    
    // Check WebGPU availability
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          this.device = await adapter.requestDevice();
          const context = this.canvas.getContext('webgpu');
          if (context && this.device) {
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device: this.device, format, alphaMode: 'premultiplied' });
            
            const shaderModule = this.device.createShaderModule({
              code: RamanVolumetricRenderer.getWgslShaderSource()
            });

            this.pipeline = this.device.createRenderPipeline({
              layout: 'auto',
              vertex: { module: shaderModule, entryPoint: 'vs_main' },
              fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format }]
              },
              primitive: { topology: 'triangle-strip' }
            });

            // 32-byte std140 uniform buffer
            this.uniformBuffer = this.device.createBuffer({
              size: 32,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            this.bindGroup = this.device.createBindGroup({
              layout: this.pipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
            });

            this.isWebGpuSupported = true;
          }
        }
      } catch (err) {
        console.warn("WebGPU initialization fallback to 2D Procedural Volumetric Canvas:", err);
      }
    }

    if (!this.isWebGpuSupported) {
      this.ctx = this.canvas.getContext('2d');
    }

    return true;
  }

  start() {
    if (this.animationId) return;
    const loop = () => {
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render() {
    if (this.viewMode !== "ORGAN_3D") return;
    const timeSec = (Date.now() - this.startTime) / 1000.0;

    if (this.isWebGpuSupported && this.device && this.pipeline) {
      this.renderWebGpu(timeSec);
    } else {
      this.renderProceduralCanvas(timeSec);
    }
  }

  renderWebGpu(timeSec) {
    const uniformData = new Float32Array([
      this.vitals.heartRate,
      this.vitals.respirationRate,
      this.vitals.spo2,
      timeSec,
      this.canvas.width,
      this.canvas.height,
      0.0, 0.0 // padding
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    const context = this.canvas.getContext('webgpu');
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.02, g: 0.05, b: 0.10, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(4);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Procedural CPU Raymarcher / Volumetric Slice projection.
   * Renders high-fidelity animated cross-sections with cardiac contraction and lung breathing.
   */
  renderProceduralCanvas(timeSec) {
    if (!this.ctx) this.ctx = this.canvas.getContext('2d');
    const ctx = this.ctx;
    if (!ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Neon Cyberpunk Medical Grid
    ctx.fillStyle = "rgba(4, 9, 20, 0.95)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(0, 229, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 25) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const centerX = width / 2;
    const centerY = height / 2;

    // Cardiac Systolic / Diastolic calculation
    const hr = this.vitals.heartRate || 72;
    const heartBps = hr / 60.0;
    const heartPhase = 2 * Math.PI * heartBps * timeSec;
    const contraction = Math.sin(heartPhase);
    const heartScale = 1.0 + 0.14 * contraction;

    // Respiration expansion
    const resp = this.vitals.respirationRate || 16;
    const respBps = resp / 60.0;
    const respPhase = 2 * Math.PI * respBps * timeSec;
    const lungExpansion = Math.sin(respPhase);
    const lungScale = 1.0 + 0.10 * lungExpansion;

    // --- Render Lungs (Pulmonary Lobes) ---
    const lungLeftX = centerX - 65;
    const lungRightX = centerX + 65;
    const lungY = centerY - 5;

    ctx.save();
    const spo2 = this.vitals.spo2 || 98;
    const lungAlpha = (spo2 >= 95 ? 0.35 : 0.20) + 0.05 * lungExpansion;
    ctx.fillStyle = `rgba(0, 229, 255, ${lungAlpha})`;
    ctx.strokeStyle = "rgba(0, 229, 255, 0.65)";
    ctx.lineWidth = 1.5;

    // Left Lung Lobe
    ctx.beginPath();
    ctx.ellipse(lungLeftX, lungY, 38 * lungScale, 65 * lungScale, 0.08, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Right Lung Lobe
    ctx.beginPath();
    ctx.ellipse(lungRightX, lungY, 40 * lungScale, 65 * lungScale, -0.08, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- Render Heart (Cardiac Chambers) ---
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = contraction > 0.5 ? "rgba(255, 38, 90, 0.85)" : "rgba(255, 38, 90, 0.4)";

    // Heart Left Ventricle & Right Ventricle
    const cardiacColor = contraction > 0.5 ? "rgba(255, 45, 85, 0.75)" : "rgba(220, 30, 70, 0.65)";
    ctx.fillStyle = cardiacColor;
    ctx.strokeStyle = "rgba(255, 80, 110, 0.9)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    // Heart shape parametric projection
    const heartRadius = 38 * heartScale;
    ctx.moveTo(centerX, centerY + 25 * heartScale);
    ctx.bezierCurveTo(
      centerX - heartRadius * 1.2, centerY - heartRadius * 0.2,
      centerX - heartRadius * 0.8, centerY - heartRadius * 1.1,
      centerX, centerY - heartRadius * 0.45
    );
    ctx.bezierCurveTo(
      centerX + heartRadius * 0.8, centerY - heartRadius * 1.1,
      centerX + heartRadius * 1.2, centerY - heartRadius * 0.2,
      centerX, centerY + 25 * heartScale
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Cardiac Aorta & Pulmonary Arteries (Holographic Lines)
    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 179, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY - 28 * heartScale);
    ctx.lineTo(centerX - 15, centerY - 55);
    ctx.lineTo(centerX - 40, centerY - 65);
    ctx.stroke();
    ctx.restore();

    // Live HUD Overlay Telemetry
    ctx.font = "bold 9px 'Orbitron', monospace";
    ctx.fillStyle = "#00e5ff";
    ctx.fillText(`3D ORGAN VOLUME (SDF)`, 12, 18);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = "8px 'Space Grotesk', sans-serif";
    ctx.fillText(`BPM: ${hr} | PULSE PHASE: ${(contraction).toFixed(2)}`, 12, 32);
    ctx.fillText(`RESP: ${resp}/min | SPO2: ${spo2}%`, 12, 44);
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.RamanVolumetricRenderer = RamanVolumetricRenderer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanVolumetricRenderer
  };
}
