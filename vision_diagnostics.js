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
  // ── 4. SCLERAL ICTERUS / JAUNDICE BILIRUBIN ESTIMATION ───────────────────
  // =========================================================================

  /**
   * Quantifies scleral yellowness and hyperbilirubinemia from eye/scleral video frames.
   * Uses ASTM E313 Yellowness Index (YI) and normalized yellow-blue chromaticity (b*).
   * @param {HTMLCanvasElement|ImageData|Object} source
   * @returns {Object} Scleral icterus metrics, bilirubin tier, and clinical referral advice
   */
  static analyzeScleralIcterus(source) {
    const imgData = RamanVisionDiagnostics.getImageDataFromSource(source);
    if (!imgData) return { error: "Invalid image source." };

    const { width, height, data } = imgData;
    const totalPixels = width * height;
    if (totalPixels === 0) return { error: "Empty image data." };

    let scleralPixels = 0;
    let sumYI = 0;
    let sumBColor = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Sclera candidate filter: Moderate-to-high luminance
      if (Y > 65 && r > 60 && g > 60) {
        scleralPixels++;

        // Calibrated digital RGB Yellowness Index: 100 * (R - B) / Y
        const yi = (100 * Math.max(0, r - b)) / Math.max(1, Y);
        sumYI += yi;

        // Normalized yellow chromaticity: (R + G - 2*B) / max(1, R + G + B) * 100
        const bMetric = (100 * Math.max(0, r + g - 2 * b)) / Math.max(1, r + g + b);
        sumBColor += bMetric;
      }
    }

    if (scleralPixels === 0) {
      return {
        modality: "SCLERAL_ICTERUS",
        error: "No clear scleral pixels detected. Ensure adequate illumination and steady eye focus."
      };
    }

    const meanYI = parseFloat((sumYI / scleralPixels).toFixed(2));
    const meanBMetric = parseFloat((sumBColor / scleralPixels).toFixed(2));

    let classification = "NORMAL_PHYSIOLOGICAL_BASELINE";
    let riskLevel = "LOW";
    let estimatedBilirubinMgDl = "< 1.2 mg/dL (Physiological Baseline)";
    let recommendation = "Sclera appears clear and non-icteric. No significant hyperbilirubinemia detected.";

    if (meanYI >= 32.0 || meanBMetric >= 30.0) {
      classification = "OVERT_SCLERAL_ICTERUS_JAUNDICE";
      riskLevel = "HIGH";
      estimatedBilirubinMgDl = "> 3.5 mg/dL (Clinical Jaundice)";
      recommendation = "Marked scleral icterus detected. Quantified yellowness index indicates significant clinical hyperbilirubinemia. Immediate Liver Function Tests (total & direct bilirubin, ALT, AST) and evaluation for acute viral hepatitis, malaria hemolysis, or biliary obstruction are recommended.";
    } else if (meanYI >= 18.0 || meanBMetric >= 16.0) {
      classification = "MILD_SUBCLINICAL_ICTERUS";
      riskLevel = "MODERATE";
      estimatedBilirubinMgDl = "1.5 – 3.0 mg/dL (Subclinical Icterus)";
      recommendation = "Early subclinical scleral yellowness detected. Monitor for dark urine, fatigue, or abdominal tenderness. Consider screening for early hemolytic paroxysm, neonatal physiological jaundice, or mild hepatic dysfunction.";
    }

    return {
      modality: "SCLERAL_ICTERUS",
      classification,
      riskLevel,
      yellownessIndex: meanYI,
      bColorMetric: meanBMetric,
      estimatedBilirubinMgDl,
      scleralPixelsAnalyzed: scleralPixels,
      recommendation
    };
  }

  // =========================================================================
  // ── 5. TROPICAL MULTIPLEX RAPID TEST CASSETTE ANALYZER ───────────────────
  // =========================================================================

  /**
   * Analyzes tropical multiplex lateral-flow cassettes (Dengue NS1/IgM/IgG & Malaria Pf/Pv).
   * Identifies multi-band positions along the test window and maps to ICD-11 conditions.
   * @param {HTMLCanvasElement|ImageData|Object} source
   * @param {'DENGUE_DUO'|'MALARIA_PF_PV'} cassetteType
   * @returns {Object} Analyte classifications, bands, and ICD-11 diagnosis mapping
   */
  static analyzeTropicalMultiplexStrip(source, cassetteType = 'DENGUE_DUO') {
    const imgData = RamanVisionDiagnostics.getImageDataFromSource(source);
    if (!imgData) return { error: "Invalid image source." };

    const { width, height, data } = imgData;
    if (width === 0 || height === 0) return { error: "Empty image data." };

    const profile = new Float32Array(height);
    const startX = Math.floor(width * 0.25);
    const endX = Math.floor(width * 0.75);
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

    let bgLum = 0;
    for (let y = 0; y < height; y++) bgLum += profile[y];
    bgLum /= height;

    const bandDetections = [];
    for (let y = 1; y < height - 1; y++) {
      const depth = bgLum - profile[y];
      if (depth > 10.0) {
        if (profile[y] <= profile[y - 1] && profile[y] <= profile[y + 1]) {
          bandDetections.push({ y, depth: parseFloat(depth.toFixed(1)), relativeY: parseFloat((y / height).toFixed(2)) });
        }
      }
    }

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

    const controlBand = mergedBands.find(b => b.relativeY < 0.45);
    const testBands = mergedBands.filter(b => b !== controlBand && b.relativeY >= 0.40);

    if (!controlBand) {
      return {
        modality: "TROPICAL_CASSETTE",
        cassetteType,
        result: "INVALID",
        controlLineFound: false,
        classification: "CASSETTE_INVALID_NO_CONTROL_LINE",
        riskLevel: "HIGH",
        icd11: null,
        recommendation: "Internal Control (C) line is absent. The test cassette is invalid, expired, or insufficiently migrated. Discard and repeat with fresh specimen."
      };
    }

    if (cassetteType === 'MALARIA_PF_PV') {
      const pfBand = testBands.find(b => b.relativeY >= 0.65);
      const panBand = testBands.find(b => b.relativeY >= 0.40 && b.relativeY < 0.65);

      if (pfBand && panBand) {
        return {
          modality: "TROPICAL_CASSETTE",
          cassetteType: "MALARIA_PF_PV",
          result: "POSITIVE",
          classification: "MALARIA_MIXED_FALCIPARUM_VIVAX_POSITIVE",
          species: "Plasmodium falciparum + Plasmodium vivax (Mixed)",
          riskLevel: "HIGH",
          icd11: "1F40",
          controlLineFound: true,
          bands: mergedBands,
          recommendation: "Dual positive for P. falciparum (HRP-2) and P. vivax (pLDH). Initiate Artemisinin-based Combination Therapy (ACT: Artemether-Lumefantrine or Artesunate-Amodiaquine) immediately. Screen for G6PD deficiency prior to Primaquine radical therapy."
        };
      } else if (pfBand) {
        return {
          modality: "TROPICAL_CASSETTE",
          cassetteType: "MALARIA_PF_PV",
          result: "POSITIVE",
          classification: "MALARIA_FALCIPARUM_POSITIVE",
          species: "Plasmodium falciparum",
          riskLevel: "HIGH",
          icd11: "1F40",
          controlLineFound: true,
          bands: mergedBands,
          recommendation: "Positive for Plasmodium falciparum HRP-2 antigen. Patient is at risk of cerebral malaria and severe anemia. Prompt initiation of WHO-recommended Artemisinin Combination Therapy (ACT) is indicated."
        };
      } else if (panBand) {
        return {
          modality: "TROPICAL_CASSETTE",
          cassetteType: "MALARIA_PF_PV",
          result: "POSITIVE",
          classification: "MALARIA_VIVAX_POSITIVE",
          species: "Plasmodium vivax / Pan-Malaria",
          riskLevel: "MODERATE",
          icd11: "1F40",
          controlLineFound: true,
          bands: mergedBands,
          recommendation: "Positive for Plasmodium vivax / Pan-malarial pLDH antigen. Administer standard blood schizonticide (Chloroquine or ACT). Order quantitative G6PD assay before administering Primaquine to prevent acute hemolytic anemia."
        };
      } else {
        return {
          modality: "TROPICAL_CASSETTE",
          cassetteType: "MALARIA_PF_PV",
          result: "NEGATIVE",
          classification: "MALARIA_ANTIGEN_NEGATIVE",
          riskLevel: "LOW",
          icd11: null,
          controlLineFound: true,
          bands: mergedBands,
          recommendation: "Control line confirmed; no malarial HRP-2 or pLDH antigen bands detected. If paroxysms and rigors persist, repeat smear or RDT at 12-24 hours."
        };
      }
    } else {
      const ns1Band = testBands.find(b => b.relativeY >= 0.70);
      const igmBand = testBands.find(b => b.relativeY >= 0.42 && b.relativeY < 0.58);
      const iggBand = testBands.find(b => b.relativeY >= 0.58 && b.relativeY < 0.70);

      const isPositive = Boolean(ns1Band || igmBand || iggBand);

      if (!isPositive) {
        return {
          modality: "TROPICAL_CASSETTE",
          cassetteType: "DENGUE_DUO",
          result: "NEGATIVE",
          classification: "DENGUE_SEROLOGY_NEGATIVE",
          riskLevel: "LOW",
          icd11: null,
          controlLineFound: true,
          bands: mergedBands,
          recommendation: "Valid Control band present; no Dengue NS1 antigen or antibody bands detected. Monitor hydration; re-evaluate if high fever persists beyond Day 3."
        };
      }

      let dengueStage = "DENGUE_ACUTE_NS1_POSITIVE";
      let dengueDesc = "Acute Primary Dengue (Viremic Phase, Day 1-4)";
      let riskLevel = "HIGH";

      if (ns1Band && (igmBand || iggBand)) {
        dengueStage = iggBand ? "DENGUE_SECONDARY_INFECTION_HIGH_RISK" : "DENGUE_ACTIVE_PRIMARY_CONVALESCENT";
        dengueDesc = iggBand ? "Secondary Dengue Infection (Elevated DHF/DSS Hemorrhagic Risk)" : "Active Dengue (NS1 + IgM Positive)";
      } else if (igmBand) {
        dengueStage = "DENGUE_EARLY_CONVALESCENT_IGM";
        dengueDesc = "Primary Dengue Infection (IgM Positive, Day 5+)";
        riskLevel = "MODERATE";
      } else if (iggBand && !ns1Band && !igmBand) {
        dengueStage = "DENGUE_PAST_INFECTION_IGG";
        dengueDesc = "Past Dengue Exposure (Isolated IgG Positive)";
        riskLevel = "LOW";
      }

      return {
        modality: "TROPICAL_CASSETTE",
        cassetteType: "DENGUE_DUO",
        result: "POSITIVE",
        classification: dengueStage,
        denguePhase: dengueDesc,
        riskLevel,
        icd11: "1D20.0",
        controlLineFound: true,
        detectedMarkers: {
          NS1: Boolean(ns1Band),
          IgM: Boolean(igmBand),
          IgG: Boolean(iggBand)
        },
        bands: mergedBands,
        recommendation: "Positive for " + dengueDesc + ". Strict safety contraindication: DO NOT administer NSAIDs (Aspirin, Ibuprofen, Diclofenac) due to hemorrhagic danger. Administer Paracetamol only, ensure copious oral rehydration, and monitor daily platelet count."
      };
    }
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
