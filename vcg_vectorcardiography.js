/**
 * RAMAN AI – 3D Vectorcardiography (VCG) & Frank Orthogonal Lead Synthesizer
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Provides:
 * - Synthesis of orthogonal Frank X, Y, Z cardiac dipole leads from bio-telemetry rhythm.
 * - 3D spatial trajectory vector loop construction (P, QRS, and T-wave loops).
 * - Exact mathematical Spatial QRS-T Angle computation:
 *     Δθ = arccos( (V_QRS · V_T) / (||V_QRS|| ||V_T||) )
 *   One of the most powerful independent prognostic markers for myocardial ischemia,
 *   arrhythmic risk, and sudden cardiac death.
 * - Frontal Mean Electrical Axis and bundle branch / hypertrophy deviation triage.
 * - Real-time 3D isometric projection canvas renderer with neon phosphor trace and shadow planes.
 */

// Frank Orthogonal Lead System Constants & Clinical Triage Thresholds
const VCG_CONFIG = {
  SAMPLE_RATE_HZ: 250,
  NORMAL_QRS_T_THRESHOLD: 45.0,     // < 45°: Normal physiological repolarization
  BORDERLINE_QRS_T_THRESHOLD: 75.0, // 45° - 75°: Borderline repolarization heterogeneity
  NORMAL_AXIS_MIN: -30.0,           // -30° to +90°: Normal electrical axis
  NORMAL_AXIS_MAX: 90.0
};

class RamanVcgEngine {
  constructor(canvas = null) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.animationId = null;
    this.rotationAngle = 0;
    this.lastTimestamp = 0;
    this.currentCondition = "normal";
    this.currentHeartRate = 72;
  }

  /**
   * Generates continuous Frank X, Y, Z orthogonal leads for a single cardiac cycle or rolling window.
   * Lead X: Transverse / lateral axis (right to left)
   * Lead Y: Vertical / inferior axis (superior to inferior)
   * Lead Z: Sagittal / anterior-posterior axis (posterior to anterior)
   */
  generateFrankLeads(heartRate = 72, condition = "normal", sampleCount = 200, timeOffset = 0) {
    const hr = Math.max(40, Math.min(180, Number(heartRate) || 72));
    const cycleDurationSec = 60.0 / hr;
    const leads = {
      t: new Float32Array(sampleCount),
      x: new Float32Array(sampleCount),
      y: new Float32Array(sampleCount),
      z: new Float32Array(sampleCount)
    };

    // Condition parameters
    const isIschemia = condition.toLowerCase().includes("ischemia") || condition.toLowerCase().includes("infarct");
    const isLAD = condition.toLowerCase().includes("lad") || condition.toLowerCase().includes("lvh");
    const isRAD = condition.toLowerCase().includes("rad") || condition.toLowerCase().includes("rvh");

    // Axis angles in radians
    let qrsFrontalAngleRad = (isLAD ? -50 : (isRAD ? 110 : 55)) * (Math.PI / 180);
    // In ischemia, T-wave vector is discordant (repolarization direction reverses)
    let tFrontalAngleRad = isIschemia 
      ? (qrsFrontalAngleRad + Math.PI * 0.7) 
      : (qrsFrontalAngleRad + (15 * Math.PI / 180));

    for (let i = 0; i < sampleCount; i++) {
      const phaseNorm = ((i / sampleCount) + timeOffset) % 1.0;
      const tSec = phaseNorm * cycleDurationSec;
      leads.t[i] = tSec;

      // 1. P-wave component (Atrial depolarization: phase ~0.10 to ~0.20)
      const pCenter = 0.15;
      const pWidth = 0.04;
      const pAmp = 0.15 * Math.exp(-Math.pow((phaseNorm - pCenter) / pWidth, 2));

      // 2. QRS complex component (Ventricular depolarization: phase ~0.35 to ~0.45)
      // Q-dip
      const qCenter = 0.38;
      const qWidth = 0.015;
      const qDip = -0.15 * Math.exp(-Math.pow((phaseNorm - qCenter) / qWidth, 2));

      // R-peak
      const rCenter = 0.40;
      const rWidth = 0.022;
      const rPeak = 1.40 * Math.exp(-Math.pow((phaseNorm - rCenter) / rWidth, 2));

      // S-dip
      const sCenter = 0.425;
      const sWidth = 0.016;
      const sDip = -0.30 * Math.exp(-Math.pow((phaseNorm - sCenter) / sWidth, 2));

      const qrsMagnitude = qDip + rPeak + sDip;

      // 3. T-wave component (Ventricular repolarization: phase ~0.60 to ~0.80)
      const tCenter = 0.68;
      const tWidth = 0.07;
      const tAmp = 0.35 * Math.exp(-Math.pow((phaseNorm - tCenter) / tWidth, 2));

      // Project onto Frank Orthogonal Coordinates (X, Y, Z)
      // X = Frontal horizontal (transverse)
      // Y = Frontal vertical (inferior)
      // Z = Sagittal (anterior-posterior)
      const px = pAmp * Math.cos(qrsFrontalAngleRad * 0.8);
      const py = pAmp * Math.sin(qrsFrontalAngleRad * 0.8);
      const pz = pAmp * 0.4;

      const qrsX = qrsMagnitude * Math.cos(qrsFrontalAngleRad);
      const qrsY = qrsMagnitude * Math.sin(qrsFrontalAngleRad);
      const qrsZ = qrsMagnitude * (isIschemia ? -0.45 : 0.50);

      const tX = tAmp * Math.cos(tFrontalAngleRad);
      const tY = tAmp * Math.sin(tFrontalAngleRad);
      const tZ = tAmp * (isIschemia ? 0.55 : 0.42);

      leads.x[i] = px + qrsX + tX;
      leads.y[i] = py + qrsY + tY;
      leads.z[i] = pz + qrsZ + tZ;
    }

    return leads;
  }

  /**
   * Computes spatial metrics:
   * - Peak QRS Spatial Vector (magnitude and 3D coords)
   * - Peak T Spatial Vector (magnitude and 3D coords)
   * - Spatial QRS-T Angle in degrees: Δθ = arccos((V_QRS · V_T) / (||V_QRS|| * ||V_T||))
   * - Frontal Mean Electrical Axis in degrees
   * - Clinical Risk Triage tier
   */
  calculateSpatialMetrics(leadData) {
    if (!leadData || !leadData.x || leadData.x.length === 0) {
      return null;
    }

    const n = leadData.x.length;
    let maxQrsMag = 0;
    let qrsIdx = 0;
    let maxTMag = 0;
    let tIdx = 0;

    // Search window for QRS: index ~ 30% to 55%
    const qrsStart = Math.floor(n * 0.30);
    const qrsEnd = Math.floor(n * 0.55);

    // Search window for T-wave: index ~ 55% to 85%
    const tStart = Math.floor(n * 0.55);
    const tEnd = Math.floor(n * 0.85);

    for (let i = qrsStart; i < qrsEnd; i++) {
      const mag = Math.hypot(leadData.x[i], leadData.y[i], leadData.z[i]);
      if (mag > maxQrsMag) {
        maxQrsMag = mag;
        qrsIdx = i;
      }
    }

    for (let i = tStart; i < tEnd; i++) {
      const mag = Math.hypot(leadData.x[i], leadData.y[i], leadData.z[i]);
      if (mag > maxTMag) {
        maxTMag = mag;
        tIdx = i;
      }
    }

    const qrsVec = {
      x: leadData.x[qrsIdx] || 0,
      y: leadData.y[qrsIdx] || 0,
      z: leadData.z[qrsIdx] || 0,
      mag: maxQrsMag || 1e-6
    };

    const tVec = {
      x: leadData.x[tIdx] || 0,
      y: leadData.y[tIdx] || 0,
      z: leadData.z[tIdx] || 0,
      mag: maxTMag || 1e-6
    };

    // Dot product: V_QRS · V_T
    const dotProduct = (qrsVec.x * tVec.x) + (qrsVec.y * tVec.y) + (qrsVec.z * tVec.z);
    const denom = qrsVec.mag * tVec.mag;
    const cosAngle = Math.max(-1.0, Math.min(1.0, dotProduct / denom));
    const spatialQrsTAngleDeg = Math.acos(cosAngle) * (180.0 / Math.PI);

    // Frontal Plane Mean Electrical Axis (Lead I vs aVF / X vs Y)
    let frontalAxisDeg = Math.atan2(qrsVec.y, qrsVec.x) * (180.0 / Math.PI);

    // Axis Classification
    let axisClassification = "Normal Axis";
    if (frontalAxisDeg < -30 && frontalAxisDeg >= -90) {
      axisClassification = "Left Axis Deviation (LAD)";
    } else if (frontalAxisDeg > 90 && frontalAxisDeg <= 180) {
      axisClassification = "Right Axis Deviation (RAD)";
    } else if (frontalAxisDeg < -90 || frontalAxisDeg > 180) {
      axisClassification = "Extreme Axis Deviation";
    }

    // Spatial Risk Tier
    let spatialRiskTier = "NORMAL";
    let riskDescription = "Normal spatial repolarization concordant with depolarization.";
    if (spatialQrsTAngleDeg > VCG_CONFIG.BORDERLINE_QRS_T_THRESHOLD) {
      spatialRiskTier = "ABNORMAL_ISCHEMIA_RISK";
      riskDescription = "Severe repolarization discordance (>75°). High risk of myocardial ischemia, acute coronary syndrome, or ventricular arrhythmia.";
    } else if (spatialQrsTAngleDeg > VCG_CONFIG.NORMAL_QRS_T_THRESHOLD) {
      spatialRiskTier = "BORDERLINE";
      riskDescription = "Borderline spatial QRS-T angle (45°–75°). Mild ventricular repolarization heterogeneity.";
    }

    return {
      spatialQrsTAngleDeg: Number(spatialQrsTAngleDeg.toFixed(1)),
      spatialRiskTier,
      riskDescription,
      frontalAxisDeg: Number(frontalAxisDeg.toFixed(1)),
      axisClassification,
      peakVoltageMv: Number(qrsVec.mag.toFixed(2)),
      qrsVector: qrsVec,
      tVector: tVec
    };
  }

  /**
   * 3D Camera Projection matrix with isometric elevation & azimuth rotation.
   */
  project3D(x, y, z, rotX, rotY, centerX, centerY, scale) {
    // 1. Azimuth rotation around vertical Y axis
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    // 2. Elevation rotation around horizontal X axis
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    return {
      x: centerX + x1 * scale,
      y: centerY - y1 * scale,
      z: z2
    };
  }

  /**
   * Renders the complete 3D Vectorcardiographic Loop onto an HTML5 Canvas.
   */
  renderVcg(canvas = null, condition = "normal", heartRate = 72, rotationDeg = null) {
    const targetCanvas = canvas || this.canvas;
    if (!targetCanvas) return null;
    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return null;

    const w = targetCanvas.width;
    const h = targetCanvas.height;

    // Clear background with dark biometric grid aesthetic
    ctx.fillStyle = "#050d1a";
    ctx.fillRect(0, 0, w, h);

    // Compute simulation data
    const leads = this.generateFrankLeads(heartRate, condition, 240);
    const metrics = this.calculateSpatialMetrics(leads);

    // Camera angles
    const rotY = (rotationDeg !== null ? rotationDeg : this.rotationAngle) * (Math.PI / 180.0);
    const rotX = 25 * (Math.PI / 180.0); // 25 degree down-angle elevation
    const centerX = w * 0.48;
    const centerY = h * 0.52;
    const scale = Math.min(w, h) * 0.42;

    // 1. Draw 3D Isometric Bounding Cube Wireframe
    ctx.strokeStyle = "rgba(0, 229, 255, 0.12)";
    ctx.lineWidth = 1;
    const boxSize = 1.2;
    const corners = [
      [-boxSize, -boxSize, -boxSize],
      [ boxSize, -boxSize, -boxSize],
      [ boxSize,  boxSize, -boxSize],
      [-boxSize,  boxSize, -boxSize],
      [-boxSize, -boxSize,  boxSize],
      [ boxSize, -boxSize,  boxSize],
      [ boxSize,  boxSize,  boxSize],
      [-boxSize,  boxSize,  boxSize]
    ];
    const projCorners = corners.map(c => this.project3D(c[0], c[1], c[2], rotX, rotY, centerX, centerY, scale));

    const edges = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7]
    ];

    ctx.beginPath();
    edges.forEach(([i, j]) => {
      ctx.moveTo(projCorners[i].x, projCorners[i].y);
      ctx.lineTo(projCorners[j].x, projCorners[j].y);
    });
    ctx.stroke();

    // 2. Draw 3D Coordinate Reference Axes
    const origin = this.project3D(0, 0, 0, rotX, rotY, centerX, centerY, scale);
    const axisX = this.project3D(1.0, 0, 0, rotX, rotY, centerX, centerY, scale);
    const axisY = this.project3D(0, 1.0, 0, rotX, rotY, centerX, centerY, scale);
    const axisZ = this.project3D(0, 0, 1.0, rotX, rotY, centerX, centerY, scale);

    // X-Axis (Red/Coral - Lateral)
    ctx.strokeStyle = "rgba(255, 77, 109, 0.4)";
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(axisX.x, axisX.y);
    ctx.stroke();

    // Y-Axis (Cyan - Inferior)
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(axisY.x, axisY.y);
    ctx.stroke();

    // Z-Axis (Yellow - Anterior)
    ctx.strokeStyle = "rgba(255, 180, 0, 0.4)";
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(axisZ.x, axisZ.y);
    ctx.stroke();

    // 3. Draw Back-Plane Shadow Projections (Frontal XY, Horizontal XZ)
    // Frontal Shadow (Z = -boxSize)
    ctx.beginPath();
    for (let i = 0; i < leads.x.length; i++) {
      const p = this.project3D(leads.x[i], leads.y[i], -boxSize, rotX, rotY, centerX, centerY, scale);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(0, 229, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Draw Main 3D Vectorcardiographic Loop Trajectory with Neon Phosphor Glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = metrics.spatialRiskTier === "ABNORMAL_ISCHEMIA_RISK" ? "rgba(255, 42, 95, 0.8)" : "rgba(0, 255, 179, 0.8)";
    ctx.strokeStyle = metrics.spatialRiskTier === "ABNORMAL_ISCHEMIA_RISK" ? "#ff2a5f" : "#00ffb3";
    ctx.lineWidth = 2.2;

    ctx.beginPath();
    for (let i = 0; i < leads.x.length; i++) {
      const p = this.project3D(leads.x[i], leads.y[i], leads.z[i], rotX, rotY, centerX, centerY, scale);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 5. Draw Max Spatial QRS Vector (Cyan Arrow) & Max T Vector (Gold/Coral Arrow)
    if (metrics.qrsVector && metrics.tVector) {
      const pQrs = this.project3D(metrics.qrsVector.x, metrics.qrsVector.y, metrics.qrsVector.z, rotX, rotY, centerX, centerY, scale);
      const pT = this.project3D(metrics.tVector.x, metrics.tVector.y, metrics.tVector.z, rotX, rotY, centerX, centerY, scale);

      // QRS vector arrow
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(pQrs.x, pQrs.y);
      ctx.stroke();

      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.arc(pQrs.x, pQrs.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // T-wave vector arrow
      ctx.strokeStyle = "#ffb400";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(pT.x, pT.y);
      ctx.stroke();

      ctx.fillStyle = "#ffb400";
      ctx.beginPath();
      ctx.arc(pT.x, pT.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Cyber Bio-Telemetry HUD Readout Overlay
    ctx.font = "bold 9px 'Orbitron', monospace";
    ctx.fillStyle = "#00e5ff";
    ctx.fillText("🫀 3D VECTORCARDIOGRAM (VCG)", 8, 14);

    ctx.font = "8px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(`Frank Orthogonal Dipole (X, Y, Z)`, 8, 24);

    // QRS-T Angle Badge
    const angleColor = metrics.spatialRiskTier === "ABNORMAL_ISCHEMIA_RISK" 
      ? "#ff2a5f" 
      : (metrics.spatialRiskTier === "BORDERLINE" ? "#ffb400" : "#00ffb3");

    ctx.fillStyle = angleColor;
    ctx.font = "bold 9px 'Orbitron', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`∠ QRS-T: ${metrics.spatialQrsTAngleDeg}°`, w - 8, 14);

    ctx.font = "8px 'Space Grotesk', sans-serif";
    ctx.fillText(`[${metrics.spatialRiskTier}]`, w - 8, 24);
    ctx.textAlign = "left";

    // Bottom Stats Readout
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.font = "8px 'Space Grotesk', sans-serif";
    ctx.fillText(`Axis: ${metrics.frontalAxisDeg}° (${metrics.axisClassification})`, 8, h - 8);

    ctx.textAlign = "right";
    ctx.fillText(`Peak: ${metrics.peakVoltageMv} mV | HR: ${heartRate} bpm`, w - 8, h - 8);
    ctx.textAlign = "left";

    return metrics;
  }

  /**
   * Starts real-time 3D rotation animation loop.
   */
  startAnimation(canvas = null, condition = "normal", heartRate = 72) {
    if (canvas) this.canvas = canvas;
    this.currentCondition = condition;
    this.currentHeartRate = heartRate;
    this.stopAnimation();

    const loop = (timestamp) => {
      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const dt = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      // Rotate ~30 degrees per second
      this.rotationAngle = (this.rotationAngle + (dt * 0.03)) % 360;
      this.renderVcg(this.canvas, this.currentCondition, this.currentHeartRate, this.rotationAngle);

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  /**
   * Stops real-time 3D rotation animation loop.
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

// Global Singleton instantiation
const ramanVcgEngine = new RamanVcgEngine();

// Browser & Node module exposure
if (typeof window !== 'undefined') {
  window.VCG_CONFIG = VCG_CONFIG;
  window.RamanVcgEngine = RamanVcgEngine;
  window.ramanVcgEngine = ramanVcgEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VCG_CONFIG,
    RamanVcgEngine,
    ramanVcgEngine
  };
}
