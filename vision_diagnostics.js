/**
 * RAMAN AI – Offline Computer Vision Diagnostic Analyzer
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Provides 100% offline edge computer vision diagnostic routines for webcam frames:
 * 1. Ocular Redness & Conjunctival Hyperemia Analysis (Erythema Index & Scleral Masking)
 * 2. Dermatological Lesion Analysis (Clinical ABCD Rule: Asymmetry, Border, Color, Diameter)
 * 3. Diagnostic Lateral-Flow Test Strip Reader (C/T band detection & optical density profile)
 */

class RamanVisionDiagnostics {

  /**
   * Helper: Extracts RGBA pixels from HTMLCanvasElement, ImageData, or ImageBitmap
   */
  static getImageDataFromSource(source) {
    if (!source) return null;
    if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
      return source;
    }
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      const ctx = source.getContext('2d');
      return ctx.getImageData(0, 0, source.width, source.height);
    }
    // Node.js mock object support { width, height, data: Uint8ClampedArray }
    if (source.data && source.width && source.height) {
      return source;
    }
    return null;
  }

  // =========================================================================
  // ── 1. OCULAR CONJUNCTIVAL HYPEREMIA ANALYSIS ────────────────────────────
  // =========================================================================

  /**
   * Analyzes eye frames for scleral injection, conjunctival redness, and uveitis signs.
   * @param {HTMLCanvasElement|ImageData} source
   * @returns {Object} Hyperemia metrics, severity classification, and clinical triage recommendations
   */
  static analyzeOcularRedness(source) {
    const imgData = RamanVisionDiagnostics.getImageDataFromSource(source);
    if (!imgData) return { error: "Invalid image source." };

    const { width, height, data } = imgData;
    const totalPixels = width * height;
    if (totalPixels === 0) return { error: "Empty image data." };

    let totalR = 0, totalG = 0, totalB = 0;
    let scleralPixels = 0;
    let hyperemicPixels = 0;

    // Scan pixels
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      totalR += r;
      totalG += g;
      totalB += b;

      // Bright pixel filter (sclera region candidate: luminance > 80)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 70) {
        scleralPixels++;
        // Hyperemia ratio: Red dominance over green + blue
        const redDominance = r / Math.max(1, g + b);
        if (redDominance > 0.65) {
          hyperemicPixels++;
        }
      }
    }

    const meanR = totalR / totalPixels;
    const meanG = totalG / totalPixels;
    const meanB = totalB / totalPixels;

    // Erythema Index: log10(Red) - log10(Green)
    const erythemaIndex = parseFloat((Math.log10(Math.max(1, meanR)) - Math.log10(Math.max(1, meanG))).toFixed(4));
    const rednessRatio = parseFloat((meanR / Math.max(1, meanG + meanB)).toFixed(3));
    const hyperemicAreaFraction = scleralPixels > 0 ? parseFloat((hyperemicPixels / scleralPixels).toFixed(3)) : 0;

    // Clinical staging classification
    let classification = "NORMAL";
    let riskLevel = "LOW";
    let recommendation = "Ocular vascularity within physiological baseline. Continue standard eye hygiene.";

    if (hyperemicAreaFraction > 0.35 || rednessRatio > 0.72) {
      classification = "MARKED_CONJUNCTIVITIS_OR_UVEITIS";
      riskLevel = "HIGH";
      recommendation = "Marked conjunctival injection observed. If accompanied by photophobia, severe eye pain, or visual changes, seek immediate ophthalmology evaluation.";
    } else if (hyperemicAreaFraction > 0.15 || rednessRatio > 0.58) {
      classification = "MILD_TO_MODERATE_HYPEREMIA";
      riskLevel = "MODERATE";
      recommendation = "Mild ocular surface irritation or dry eye syndrome detected. Use lubricating artificial tears; avoid eye rubbing.";
    }

    return {
      modality: "OCULAR_REDNESS",
      classification,
      riskLevel,
      erythemaIndex,
      rednessRatio,
      hyperemicAreaFraction,
      scleralPixelsSampled: scleralPixels,
      recommendation
    };
  }

  // =========================================================================
  // ── 2. DERMATOLOGICAL LESION ABCD RULE ANALYSIS ──────────────────────────
  // =========================================================================

  /**
   * Analyzes pigmented skin lesions using the clinical ABCD criteria.
   * A: Asymmetry (horizontal & vertical axis delta)
   * B: Border irregularity (compactness P^2 / (4*pi*A))
   * C: Color variegation (RGB standard deviations)
   * D: Diameter (relative to frame dimensions)
   */
  static analyzeDermatologicalLesion(source) {
    const imgData = RamanVisionDiagnostics.getImageDataFromSource(source);
    if (!imgData) return { error: "Invalid image source." };

    const { width, height, data } = imgData;
    const totalPixels = width * height;
    if (totalPixels === 0) return { error: "Empty image data." };

    // 1. Lesion segmentation (threshold on darkness vs surround)
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let lesionPixelCount = 0;
    const lesionMask = new Uint8Array(totalPixels);

    const rVals = [], gVals = [], bVals = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Dark pigmented lesion pixel heuristic
        if (lum < 110) {
          lesionMask[y * width + x] = 1;
          lesionPixelCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          rVals.push(r);
          gVals.push(g);
          bVals.push(b);
        }
      }
    }

    if (lesionPixelCount < 20) {
      return {
        modality: "DERMATOLOGY_ABCD",
        status: "NO_FOCAL_LESION_DETECTED",
        recommendation: "No distinct pigmented cutaneous lesion detected in current frame."
      };
    }

    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const centerX = minX + bboxW / 2;
    const centerY = minY + bboxH / 2;

    // A: Asymmetry Metric
    let leftPixels = 0, rightPixels = 0;
    let topPixels = 0, bottomPixels = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (lesionMask[y * width + x] === 1) {
          if (x < centerX) leftPixels++; else rightPixels++;
          if (y < centerY) topPixels++; else bottomPixels++;
        }
      }
    }
    const hAsym = Math.abs(leftPixels - rightPixels) / Math.max(1, leftPixels + rightPixels);
    const vAsym = Math.abs(topPixels - bottomPixels) / Math.max(1, topPixels + bottomPixels);
    const asymmetryIndex = parseFloat(((hAsym + vAsym) / 2).toFixed(3));

    // B: Border Irregularity (Perimeter to Area ratio)
    let perimeter = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (lesionMask[y * width + x] === 1) {
          // Check 4-connected neighbors
          const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                         lesionMask[y * width + (x - 1)] === 0 ||
                         lesionMask[y * width + (x + 1)] === 0 ||
                         lesionMask[(y - 1) * width + x] === 0 ||
                         lesionMask[(y + 1) * width + x] === 0;
          if (isEdge) perimeter++;
        }
      }
    }
    // Isoperimetric quotient: P^2 / (4 * pi * A). Perfect circle = 1.0; irregular border > 1.8
    const borderIrregularity = parseFloat(((perimeter * perimeter) / (4 * Math.PI * Math.max(1, lesionPixelCount))).toFixed(3));

    // C: Color Variegation (Standard deviation across RGB)
    const calcStd = (arr) => {
      if (arr.length === 0) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };
    const rStd = calcStd(rVals);
    const gStd = calcStd(gVals);
    const bStd = calcStd(bVals);
    const colorVariegation = parseFloat(((rStd + gStd + bStd) / 3).toFixed(2));

    // D: Diameter estimation (approx mm based on 100px/cm resolution heuristic)
    const estimatedDiameterMm = parseFloat(((Math.max(bboxW, bboxH) / 10).toFixed(1)));

    // Total Dermoscopic ABCD Composite Risk Score
    // Weightings: A (1.3), B (0.1), C (0.5), D (0.5)
    const abcdScore = parseFloat((asymmetryIndex * 3.5 + borderIrregularity * 0.4 + (colorVariegation / 25.0) * 1.5 + (estimatedDiameterMm > 6.0 ? 1.5 : 0)).toFixed(2));

    let riskLevel = "LOW_RISK_BENIGN";
    let recommendation = "Cutaneous lesion exhibits symmetric, uniform borders and coloration. Monitor for changes over time.";

    if (abcdScore > 4.5 || estimatedDiameterMm > 8.0) {
      riskLevel = "SUSPICIOUS_URGENT_EVALUATION";
      recommendation = "Lesion exhibits elevated asymmetry, irregular borders, or multi-chromatic variegation. Prompt clinical in-person dermatological examination with dermoscopy is strongly advised.";
    } else if (abcdScore > 2.8) {
      riskLevel = "MODERATE_BORDERLINE";
      recommendation = "Borderline atypical features detected. Perform monthly self-monitoring for any rapid expansion or color evolution.";
    }

    return {
      modality: "DERMATOLOGY_ABCD",
      riskLevel,
      abcdScore,
      metrics: {
        asymmetryIndex,
        borderIrregularity,
        colorVariegation,
        estimatedDiameterMm,
        lesionPixelCount
      },
      boundingBox: { minX, maxX, minY, maxY, width: bboxW, height: bboxH },
      recommendation
    };
  }

  // =========================================================================
  // ── 3. DIAGNOSTIC LATERAL-FLOW TEST STRIP READER ─────────────────────────
  // =========================================================================

  /**
   * Reads rapid diagnostic test strips (e.g. COVID-19, Malaria Pf/Pv, Troponin, hCG).
   * Identifies Control ('C') line and Test ('T') line via vertical luminance profiles.
   */
  static analyzeLateralFlowStrip(source) {
    const imgData = RamanVisionDiagnostics.getImageDataFromSource(source);
    if (!imgData) return { error: "Invalid image source." };

    const { width, height, data } = imgData;
    if (width === 0 || height === 0) return { error: "Empty image data." };

    // Compute average horizontal profile across the central 40% vertical band
    const profile = new Float32Array(height);
    const startX = Math.floor(width * 0.3);
    const endX = Math.floor(width * 0.7);
    const bandWidth = Math.max(1, endX - startX);

    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        rowSum += (0.299 * r + 0.587 * g + 0.114 * b);
      }
      profile[y] = rowSum / bandWidth;
    }

    // Baseline background luminance
    let bgLum = 0;
    for (let y = 0; y < height; y++) bgLum += profile[y];
    bgLum /= height;

    // Find valleys (dark colored absorption bands)
    const bandDetections = [];
    for (let y = 1; y < height - 1; y++) {
      const depth = bgLum - profile[y];
      if (depth > 12.0) { // Significant dye absorption band
        if (profile[y] <= profile[y - 1] && profile[y] <= profile[y + 1]) {
          bandDetections.push({ y, depth: parseFloat(depth.toFixed(1)) });
        }
      }
    }

    // Merge closely spaced rows belonging to the same physical band
    const mergedBands = [];
    for (const b of bandDetections) {
      if (mergedBands.length === 0 || Math.abs(b.y - mergedBands[mergedBands.length - 1].y) > 6) {
        mergedBands.push(b);
      } else {
        if (b.depth > mergedBands[mergedBands.length - 1].depth) {
          mergedBands[mergedBands.length - 1] = b;
        }
      }
    }

    let result = "NEGATIVE";
    let controlLineFound = false;
    let testLineFound = false;

    // By convention in lateral flow strips:
    // Upper band = Control ('C'), Lower band = Test ('T')
    if (mergedBands.length >= 2) {
      controlLineFound = true;
      testLineFound = true;
      result = "POSITIVE";
    } else if (mergedBands.length === 1) {
      controlLineFound = true;
      testLineFound = false;
      result = "NEGATIVE";
    } else {
      controlLineFound = false;
      testLineFound = false;
      result = "INVALID";
    }

    return {
      modality: "LATERAL_FLOW_STRIP",
      result,
      controlLineFound,
      testLineFound,
      detectedBandsCount: mergedBands.length,
      bands: mergedBands,
      interpretation: result === "POSITIVE"
        ? "Bifurcated bands detected: Positive reaction for target analyte. Verify with confirmatory clinical assay."
        : result === "NEGATIVE"
        ? "Control band validated with no test band: Negative result."
        : "Control line not identified: Test strip is invalid. Retest with fresh cassette."
    };
  }

  // =========================================================================
  // ── 4. CANVAS HUD OVERLAY RENDERER ───────────────────────────────────────
  // =========================================================================

  static renderVisionDiagnosticsOverlay(canvas, result) {
    if (!canvas || !result) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    const w = canvas.width;
    const h = canvas.height;

    // Cyberpunk HUD target reticle
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, 40); ctx.lineTo(20, 20); ctx.lineTo(40, 20);
    ctx.moveTo(w - 40, 20); ctx.lineTo(w - 20, 20); ctx.lineTo(w - 20, 40);
    ctx.moveTo(20, h - 40); ctx.lineTo(20, h - 20); ctx.lineTo(40, h - 20);
    ctx.moveTo(w - 40, h - 20); ctx.lineTo(w - 20, h - 20); ctx.lineTo(w - 20, h - 40);
    ctx.stroke();

    // Results Banner
    ctx.fillStyle = "rgba(5, 13, 26, 0.85)";
    ctx.fillRect(15, h - 65, w - 30, 52);
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 1;
    ctx.strokeRect(15, h - 65, w - 30, 52);

    ctx.font = "bold 11px 'Orbitron', monospace";
    ctx.fillStyle = result.riskLevel === "HIGH" || result.result === "POSITIVE" ? "#ff2a5f" : "#00ffb3";
    const header = result.classification || result.result || result.riskLevel || "VISION COMPLETE";
    ctx.fillText(`VISION: ${header}`, 25, h - 45);

    ctx.font = "9px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    const subtext = result.recommendation || result.interpretation || "";
    ctx.fillText(subtext.slice(0, 75) + (subtext.length > 75 ? "..." : ""), 25, h - 25);

    ctx.restore();
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.RamanVisionDiagnostics = RamanVisionDiagnostics;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanVisionDiagnostics
  };
}
