/**
 * RAMAN AI – Automated Multimodal Diagnostic & Continuous SLM Engine Test Suite
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Tests:
 * 1. Video rPPG Non-Contact Physiological Sensing (Pulse, HRV, Respiratory Rate)
 * 2. Calibrated Optical Dermal ABCD Analyzer & Total Dermatoscopy Score
 * 3. Paper Lab Test OCR Table Parser & LOINC Standardization
 * 4. 12-Lead Paper ECG Trace Digitizer & STEMI / Arrhythmia Classifier
 * 5. Multimodal Latent Fusion & 99% Split Conformal Prediction Sets
 * 6. HIPAA Safe Harbor De-Identification & PHI Scrubbing
 * 7. Continuous SLM Auto-Training Engine (SFT + DPO + LoRA + EWC Guard)
 * 8. Automated Benchmark Regression Gating & 4-Bit AWQ OTA Compilation
 */

const { ramanMultimodalEngine } = require('../multimodal_diagnostic_engine.js');
const { ramanContinuousSlmTrainer } = require('../continuous_slm_trainer.js');
const { generateMultimodalFhirDiagnosticReport } = require('../fhir_exporter.js');

console.log("==================================================================");
console.log("🔬 RAMAN AI: MULTIMODAL DIAGNOSTICS & CONTINUOUS SLM TEST RUNNER");
console.log("==================================================================\n");

let passes = 0;
let fails = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    fails++;
    return false;
  }
  console.log(`  ✅ PASS: ${message}`);
  passes++;
  return true;
}

async function runTestSuite() {

  // =========================================================================
  // ── TEST 1: Video rPPG Hemodynamic Telemetry ─────────────────────────────
  // =========================================================================
  console.log("🏃 Test Suite 01: Video rPPG Hemodynamic Sensing (Pulse, HRV, RR)");
  console.log("------------------------------------------------------------------");
  {
    const fps = 30;
    const durationSec = 4;
    const frameCount = fps * durationSec;
    const simulatedFrames = [];
    const targetBpm = 75;
    const cardiacFreqHz = targetBpm / 60.0; // 1.25 Hz

    // Generate sinusoidal green-channel blood volume pulse waveform
    for (let i = 0; i < frameCount; i++) {
      const t = i / fps;
      const bvpOscillation = 0.08 * Math.sin(2 * Math.PI * cardiacFreqHz * t);
      simulatedFrames.push({
        r: 180 + Math.random() * 2,
        g: 130 + bvpOscillation * 255,
        b: 110 + Math.random() * 2,
        t
      });
    }

    const rppgResult = ramanMultimodalEngine.processVideoRppg(simulatedFrames, fps);
    assert(rppgResult.modality === "VIDEO_RPPG", "rPPG modality tag correctly assigned.");
    assert(rppgResult.heartRateBpm >= 65 && rppgResult.heartRateBpm <= 85, `Pulse rate extracted within expected physiological range (Got: ${rppgResult.heartRateBpm} BPM).`);
    assert(rppgResult.hrvSdnnMs > 0, `Valid Heart Rate Variability SDNN metric computed: ${rppgResult.hrvSdnnMs} ms.`);
    assert(rppgResult.respirationRateBpm >= 12 && rppgResult.respirationRateBpm <= 24, `Estimated respiratory rate within normal adult range: ${rppgResult.respirationRateBpm} breaths/min.`);
    assert(rppgResult.confidence >= 0.75, `Telemetry confidence score exceeds threshold: ${rppgResult.confidence}.`);
  }

  // =========================================================================
  // ── TEST 2: Calibrated Dermal ABCD & Melanoma Risk Analyzer ──────────────
  // =========================================================================
  console.log("\n🏃 Test Suite 02: Calibrated Dermal ABCD & Melanoma Risk Analyzer");
  console.log("------------------------------------------------------------------");
  {
    const w = 120, h = 120;
    const mockPixels = new Uint8ClampedArray(w * h * 4);

    // Initialize healthy skin background (fair Caucasian skin ~RGB 220, 180, 160)
    for (let i = 0; i < mockPixels.length; i += 4) {
      mockPixels[i] = 220;     // R
      mockPixels[i + 1] = 180; // G
      mockPixels[i + 2] = 160; // B
      mockPixels[i + 3] = 255; // Alpha
    }

    // Paint an asymmetrical, irregular, multi-colored dysplastic lesion in center
    for (let y = 18; y < 105; y++) {
      for (let x = 15; x < 105; x++) {
        // High vertical elongation (a=18, b=40 => aspectRatio ~ 0.45, asymmetryIndex ~ 0.55 > 0.45 => aScore = 2.0)
        if ((x - 55) * (x - 55) / 324 + (y - 60) * (y - 60) / 1600 < 1.0) {
          const idx = (y * w + x) * 4;
          if (x < 48) {
            // Dark brown/black zone
            mockPixels[idx] = 40; mockPixels[idx + 1] = 25; mockPixels[idx + 2] = 20;
          } else if (x < 68) {
            // Reddish-brown zone
            mockPixels[idx] = 160; mockPixels[idx + 1] = 50; mockPixels[idx + 2] = 40;
          } else {
            // Blue-gray zone
            mockPixels[idx] = 60; mockPixels[idx + 1] = 75; mockPixels[idx + 2] = 95;
          }
        }
      }
    }

    const dermalResult = ramanMultimodalEngine.analyzeDermalLesion(
      { width: w, height: h, data: mockPixels },
      { pxPerMm: 10.0 } // 10 px = 1mm => ~8mm lesion
    );

    assert(dermalResult.modality === "DERMATOLOGY", "Dermatology modality tag correctly assigned.");
    assert(dermalResult.tdsScore > 5.0, `Total Dermatoscopy Score (TDS) calculated: ${dermalResult.tdsScore}.`);
    assert(dermalResult.diameterMm >= 6.0, `Lesion diameter correctly estimated: ${dermalResult.diameterMm} mm.`);
    assert(dermalResult.distinctColorCount >= 3, `Multi-chromatic pigment zones identified: ${dermalResult.distinctColorCount} colors.`);
    assert(dermalResult.riskTier === "SUSPICIOUS_MALIGNANT_RISK", `High-risk dysplastic classification verified: ${dermalResult.riskTier}.`);
  }

  // =========================================================================
  // ── TEST 3: Paper Lab Test OCR Table Parser & LOINC Normalizer ───────────
  // =========================================================================
  console.log("\n🏃 Test Suite 03: Paper Lab Test OCR Table Parser & LOINC Normalizer");
  console.log("------------------------------------------------------------------");
  {
    const simulatedOcrText = `
      METROPOLITAN CLINICAL BIOCHEMISTRY LABORATORY
      Patient: [REDACTED] | Date: 12-Nov-2026
      ======================================================
      TEST NAME                 RESULT    UNITS      REF RANGE
      Troponin I, High Sens.    45.2      pg/mL      0.0 - 19.8   [HIGH]
      Serum Creatinine          2.4       mg/dL      0.7 - 1.3    [HIGH]
      Potassium (K+)            5.8       mmol/L     3.5 - 5.1    [HIGH]
      Hemoglobin                14.2      g/dL       13.5 - 17.5  [NORMAL]
      Platelets                 240       10^3/uL    150 - 450    [NORMAL]
      ======================================================
    `;

    const labResult = ramanMultimodalEngine.parsePaperLabReport(simulatedOcrText);

    assert(labResult.modality === "LAB_TEST_REPORT", "Lab report modality tag verified.");
    assert(labResult.totalAnalytesFound >= 5, `Successfully parsed ${labResult.totalAnalytesFound} analytes from raw text.`);
    assert(labResult.hasEmergencyAlert === false, "No fatal panic thresholds crossed, high alerts flagged.");
    assert(labResult.abnormalCount >= 3, `Correctly flagged ${labResult.abnormalCount} abnormal out-of-range biomarkers.`);

    const trop = labResult.analytes.find(a => a.key === "TROPONIN_I");
    assert(trop && trop.loincCode === "89579-7", "Troponin I correctly mapped to LOINC 89579-7.");
    assert(trop.value === 45.2, "Troponin numeric value parsed accurately: 45.2 pg/mL.");
    assert(trop.flag === "HIGH", "Troponin flagged as HIGH elevation.");

    const k = labResult.analytes.find(a => a.key === "POTASSIUM");
    assert(k && k.loincCode === "2823-3", "Potassium mapped to LOINC 2823-3.");
    assert(k.value === 5.8, "Potassium value extracted: 5.8 mmol/L.");
  }

  // =========================================================================
  // ── TEST 4: 12-Lead Paper ECG Digitizer & STEMI Arrhythmia Classifier ───
  // =========================================================================
  console.log("\n🏃 Test Suite 04: 12-Lead Paper ECG Digitizer & STEMI Classifier");
  console.log("------------------------------------------------------------------");
  {
    const sampleRate = 250;
    const durationSec = 3;
    const totalSamples = sampleRate * durationSec;
    const ecgLeadSignal = new Float32Array(totalSamples);
    const hr = 80;
    const cycleLen = Math.round(sampleRate * (60.0 / hr));

    // Synthesize cardiac cycle with sharp triangular R-peaks and elevated ST-segment (0.26 mV)
    for (let i = 0; i < totalSamples; i++) {
      const cyclePos = i % cycleLen;
      const rPeakPos = Math.round(cycleLen * 0.25);
      const distToR = Math.abs(cyclePos - rPeakPos);
      if (distToR === 0) {
        ecgLeadSignal[i] = 1.45; // Sharp R-peak apex
      } else if (distToR === 1) {
        ecgLeadSignal[i] = 0.85;
      } else if (distToR === 2) {
        ecgLeadSignal[i] = 0.30;
      } else if (cyclePos >= Math.round(cycleLen * 0.28) && cyclePos <= Math.round(cycleLen * 0.40)) {
        ecgLeadSignal[i] = 0.26; // Elevated ST segment (STEMI signature)
      } else if (Math.abs(cyclePos - Math.round(cycleLen * 0.50)) <= 4) {
        ecgLeadSignal[i] = 0.15; // T-wave
      } else {
        ecgLeadSignal[i] = 0.0;
      }
    }

    const ecgResult = ramanMultimodalEngine.digitizeAndClassifyEcg(ecgLeadSignal, sampleRate);

    assert(ecgResult.modality === "ELECTROCARDIOGRAM_12LEAD", "ECG modality verified.");
    assert(ecgResult.heartRateBpm >= 75 && ecgResult.heartRateBpm <= 85, `Heart rate computed accurately: ${ecgResult.heartRateBpm} BPM.`);
    assert(ecgResult.stElevationMv >= 0.20, `ST-segment elevation detected: ${ecgResult.stElevationMv} mV.`);
    assert(ecgResult.isEmergencyCatheterizationCandidate === true, "Emergency catheterization candidate flagged.");
    assert(ecgResult.rhythmClassification.includes("STEMI"), `Classified as acute STEMI (Got: '${ecgResult.rhythmClassification}').`);
  }

  // =========================================================================
  // ── TEST 5: Multimodal Fusion & Split Conformal Prediction Engine ────────
  // =========================================================================
  console.log("\n🏃 Test Suite 05: Multimodal Fusion & 99% Conformal Prediction Sets");
  console.log("------------------------------------------------------------------");
  {
    // Provide congruent multi-source inputs: STEMI on ECG + High Troponin on Lab + Stable rPPG
    const mockInputs = {
      ecgData: {
        isEmergencyCatheterizationCandidate: true,
        rhythmClassification: "Acute ST-Elevation Myocardial Infarction (STEMI)"
      },
      labData: {
        analytes: [
          { key: "TROPONIN_I", value: 45.2, units: "pg/mL", flag: "HIGH" },
          { key: "POTASSIUM", value: 4.2, units: "mmol/L", flag: "NORMAL" }
        ]
      },
      rppgData: { heartRateBpm: 82, respirationRateBpm: 18 }
    };

    const fusionResult = ramanMultimodalEngine.synthesizeMultimodalDiagnosis(mockInputs);

    assert(fusionResult.primaryDiagnosis.includes("Myocardial Infarction"), `Primary diagnosis matches ground-truth pathology: ${fusionResult.primaryDiagnosis}.`);
    assert(fusionResult.overallConfidence >= 0.98, `Fused confidence reflects high cross-modal congruence: ${fusionResult.overallConfidence}.`);
    assert(fusionResult.conformalCoverageTarget === "99.0%", "Conformal coverage target confirmed at 99%.");
    assert(Array.isArray(fusionResult.conformalPredictionSet), "Conformal prediction set is structured array.");
    assert(fusionResult.conformalPredictionSet.includes(fusionResult.primaryDiagnosis), "Prediction set contains primary diagnosis.");
    assert(fusionResult.requiresMandatoryPhysicianSignOff === true, "Mandatory human-in-the-loop sign-off enforced.");
  }

  // =========================================================================
  // ── TEST 6: HIPAA Safe Harbor De-Identification & PHI Scrubber ───────────
  // =========================================================================
  console.log("\n🏃 Test Suite 06: HIPAA Safe Harbor De-Identification & PHI Scrubber");
  console.log("------------------------------------------------------------------");
  {
    const rawCase = {
      patientName: "Dr. Jonathan Smith",
      mrn: "MRN-9948214",
      rawText: "Patient Mr. Jonathan Smith (MRN-9948214) visited with phone 555-019-2834 and email jsmith@hospital.org presenting with severe chest pain.",
      age: 58,
      gender: "male",
      seed: 42
    };

    const sanitized = ramanContinuousSlmTrainer.deidentifyRecord(rawCase);

    assert(!sanitized.anonymizedText.includes("Jonathan Smith"), "Patient name successfully scrubbed from text.");
    assert(!sanitized.anonymizedText.includes("MRN-9948214"), "MRN successfully scrubbed from narrative.");
    assert(!sanitized.anonymizedText.includes("555-019-2834"), "Phone number scrubbed.");
    assert(!sanitized.anonymizedText.includes("jsmith@hospital.org"), "Email scrubbed.");
    assert(sanitized.pseudoId.startsWith("ANON-UUID-"), `Deterministic pseudonymized HMAC generated: ${sanitized.pseudoId}.`);
    assert(sanitized.ageGroup === "18-64", "Age normalized to coarse demographic group.");
  }

  // =========================================================================
  // ── TEST 7: Continuous SLM Ingestion, SFT & DPO Dataset Generation ───────
  // =========================================================================
  console.log("\n🏃 Test Suite 07: Continuous SLM Ingestion, SFT & DPO Synthesis");
  console.log("------------------------------------------------------------------");
  {
    // 1. Test unverified case rejection
    const unverifiedResult = ramanContinuousSlmTrainer.ingestVerifiedClinicalPair(
      { rawText: "Chest pain", opticalScore: 0.9 },
      { approvedDiagnosis: null, signatureValid: false }
    );
    assert(unverifiedResult.eligible === false, "Unsigned case rejected by verification gate.");

    // 2. Test verified case ingestion
    const verifiedResult = ramanContinuousSlmTrainer.ingestVerifiedClinicalPair(
      {
        rawText: "Crushing chest discomfort radiating to jaw with diaphoresis",
        opticalScore: 0.95,
        signalScore: 0.92,
        initialModelDraft: "Probable muscular chest strain or mild GERD",
        multimodalPayloads: { troponin: 52.0, stElevation: 0.22 }
      },
      {
        approvedDiagnosis: "Acute Anterolateral STEMI",
        physicianNotes: "12-lead ECG reveals 2.2mm ST elevation in V2-V4 with elevated troponin. Emergency PCI triggered.",
        signatureValid: true,
        isSpecialist: true
      }
    );

    assert(verifiedResult.eligible === true, "Clinician-signed case accepted into ingestion stream.");
    assert(verifiedResult.compositeQuality >= 0.85, `Composite quality gate passed: ${verifiedResult.compositeQuality}.`);

    // Ingest 4 more cases to meet the batch threshold of 5
    for (let i = 1; i <= 4; i++) {
      ramanContinuousSlmTrainer.ingestVerifiedClinicalPair(
        {
          rawText: `Synthetic clinical case presentation #${i} with diagnostic biomarkers`,
          opticalScore: 0.92,
          signalScore: 0.90,
          initialModelDraft: `Initial model draft #${i}`,
          multimodalPayloads: { testId: i }
        },
        {
          approvedDiagnosis: `Confirmed Clinical Condition #${i}`,
          physicianNotes: `Physician edited rationale #${i}`,
          signatureValid: true,
          isSpecialist: true
        }
      );
    }

    const { sftDataset, dpoDataset } = ramanContinuousSlmTrainer.synthesizeTrainingDatasets();
    assert(sftDataset.length >= 5, `Synthesized ${sftDataset.length} Supervised Instruction (SFT) training pairs.`);
    assert(dpoDataset.length >= 1, `Synthesized ${dpoDataset.length} Direct Preference Optimization (DPO) pairs.`);
    assert(dpoDataset[0].chosen.includes("Emergency PCI"), "DPO winning candidate accurately preserves physician-edited report.");
    assert(dpoDataset[0].rejected.includes("muscular chest strain"), "DPO losing candidate captures rejected initial model draft.");
  }

  // =========================================================================
  // ── TEST 8: Continual LoRA Training Sweep, EWC & AWQ OTA Compilation ────
  // =========================================================================
  console.log("\n🏃 Test Suite 08: Continual LoRA Sweep, EWC & AWQ OTA Compilation");
  console.log("------------------------------------------------------------------");
  {
    const initialVersion = ramanContinuousSlmTrainer.currentModelVersion;
    const trainingSweep = ramanContinuousSlmTrainer.executeContinualTrainingSweep();

    assert(trainingSweep.status === "SUCCESS_PROMOTED_FOR_DEPLOYMENT", "Continual training sweep promoted successfully.");
    assert(trainingSweep.trainedSamplesCount >= 5, `Trained on ${trainingSweep.trainedSamplesCount} clinical pairs.`);
    assert(trainingSweep.ewcPenalty > 0, `Elastic Weight Consolidation (EWC) penalty active: ${trainingSweep.ewcPenalty}.`);
    assert(trainingSweep.candidateVersion !== initialVersion, `Model version bumped: ${initialVersion} -> ${trainingSweep.candidateVersion}.`);

    // Benchmark Regression Gate Verification
    const bench = trainingSweep.benchmarkResults;
    assert(bench.passedAllGates === true, "Candidate model passed all automated regression gates.");
    assert(bench.mimicCxrAccuracy >= 0.92, `MIMIC-CXR benchmark accuracy retained: ${bench.mimicCxrAccuracy}.`);
    assert(bench.fitzpatrickEquityScore >= 0.97, `Demographic equity score verified on Fitzpatrick V-VI: ${bench.fitzpatrickEquityScore}.`);

    // Quantization & OTA Packaging
    const ota = trainingSweep.otaPayload;
    assert(ota.quantization === "INT4_AWQ", "Adapter weights compressed with 4-bit AWQ.");
    assert(ota.compressionRatio.includes("8x"), "8x weight compression ratio achieved.");
    assert(ota.cryptographicSignature.startsWith("ED25519-SIG-"), "OTA payload verified with cryptographic signature.");
    assert(ota.compatibleRuntimes.includes("ExecuTorch Mobile"), "Edge runtime compatibility verified.");
  }

  // =========================================================================
  // ── TEST 9: Chest Radiography (X-Ray) Feature Ingestion ──────────────────
  // =========================================================================
  console.log("\n🏃 Test Suite 09: Chest Radiography (X-Ray) Feature Ingestion");
  console.log("------------------------------------------------------------------");
  {
    const xrayInput = {
      cardiothoracicRatio: 0.58,
      hasConsolidation: true,
      hasPleuralEffusion: true,
      hasPneumothorax: false
    };

    const xrayResult = ramanMultimodalEngine.analyzeRadiologyImage(xrayInput);
    assert(xrayResult.modality === "CHEST_RADIOGRAPHY_XRAY", "Radiology modality tag verified.");
    assert(xrayResult.isCardiomegaly === true, "Cardiomegaly correctly flagged for CTR > 0.50 (0.58).");
    assert(xrayResult.hasConsolidation === true, "Focal consolidation identified.");
    assert(xrayResult.findingsSummary.some(f => f.includes("Cardiomegaly")), "Findings summary notes cardiomegaly.");
    assert(xrayResult.findingsSummary.some(f => f.includes("Pleural Effusion")), "Findings summary notes pleural effusion.");
  }

  // =========================================================================
  // ── TEST 10: Dynamic Cardiac Ultrasound Video Telemetry (LVEF %) ─────────
  // =========================================================================
  console.log("\n🏃 Test Suite 10: Dynamic Cardiac Ultrasound Video Telemetry (LVEF %)");
  console.log("------------------------------------------------------------------");
  {
    const echoInput = {
      endDiastolicVolumeMl: 130,
      endSystolicVolumeMl: 85,
      wallMotionScore: 1.8
    };

    const echoResult = ramanMultimodalEngine.analyzeUltrasoundLoop(echoInput);
    assert(echoResult.modality === "CARDIAC_ULTRASOUND_ECHOCARDIOGRAM", "Ultrasound modality verified.");
    assert(echoResult.strokeVolumeMl === 45, `Stroke volume accurately computed: ${echoResult.strokeVolumeMl} mL.`);
    assert(echoResult.lvefPercent === 34.6, `Left Ventricular Ejection Fraction (LVEF) computed: ${echoResult.lvefPercent}%.`);
    assert(echoResult.isHeartFailure === true, "Heart failure detected based on LVEF < 40%.");
    assert(echoResult.heartFailureClassification.includes("HFrEF"), `Heart failure subtype classified as HFrEF (Got: ${echoResult.heartFailureClassification}).`);
  }

  // =========================================================================
  // ── TEST 11: HL7 FHIR R4 Multimodal DiagnosticReport Bundle Exporter ─────
  // =========================================================================
  console.log("\n🏃 Test Suite 11: HL7 FHIR R4 Multimodal DiagnosticReport Exporter");
  console.log("------------------------------------------------------------------");
  {
    const mockDiagnosis = {
      primaryDiagnosis: "Acute ST-Elevation Myocardial Infarction",
      primaryIcd10: "I21.9",
      overallConfidence: 0.995,
      conformalPredictionSet: ["Acute ST-Elevation Myocardial Infarction", "Acute Pericarditis"]
    };

    const mockProfile = { name: "Ramanuja Pathy", gender: "Male" };
    const mockRawInputs = {
      labData: {
        analytes: [
          { key: "TROPONIN_I", testName: "Troponin I.cardiac", loincCode: "89579-7", value: 52.4, units: "pg/mL", flag: "HIGH" }
        ]
      },
      ecgData: {
        rhythmClassification: "Acute ST-Elevation Myocardial Infarction (STEMI)",
        heartRateBpm: 80,
        prIntervalMs: 160,
        qrsDurationMs: 95,
        qtcIntervalMs: 440,
        stElevationMv: 0.26
      },
      rppgData: {
        heartRateBpm: 80,
        hrvSdnnMs: 45,
        respirationRateBpm: 18
      }
    };

    const fhirBundle = generateMultimodalFhirDiagnosticReport("RMN-FHIR-TEST-001", mockDiagnosis, mockProfile, mockRawInputs);
    assert(fhirBundle.resourceType === "Bundle", "Root FHIR document is a valid Bundle.");
    assert(fhirBundle.type === "document", "Bundle type is document.");
    assert(fhirBundle.total >= 4, `Bundle contains ${fhirBundle.total} standard FHIR entries.`);

    const diagReport = fhirBundle.entry.find(e => e.resource.resourceType === "DiagnosticReport");
    assert(Boolean(diagReport), "DiagnosticReport resource present in Bundle.");
    assert(diagReport.resource.code.coding[0].code === "11526-1", "DiagnosticReport matches LOINC 11526-1.");
    assert(diagReport.resource.conclusion.includes("Myocardial Infarction"), "Conclusion states Myocardial Infarction.");

    const confExt = diagReport.resource.extension.find(ext => ext.url.includes("conformal-prediction-set"));
    assert(Boolean(confExt) && confExt.valueString.includes("Myocardial Infarction"), "Conformal prediction set extension embedded in DiagnosticReport.");

    const obsEntries = fhirBundle.entry.filter(e => e.resource.resourceType === "Observation");
    assert(obsEntries.length >= 3, `Found ${obsEntries.length} Observation resources (Lab, ECG, rPPG).`);
  }

  // =========================================================================
  // ── FINAL SUMMARY ────────────────────────────────────────────────────────
  // =========================================================================
  console.log("\n==================================================================");
  console.log("📊 MULTIMODAL DIAGNOSTIC & SLM FLYWHEEL TEST SUMMARY");
  console.log("==================================================================");
  console.log(`Total Passed Assertions: ${passes}`);
  console.log(`Total Failed Assertions: ${fails}`);

  if (fails === 0) {
    console.log("🌟 ALL MULTIMODAL ENGINES & SLM AUTO-TRAINING FLYWHEEL OPERATIONAL!");
    process.exit(0);
  } else {
    console.error("🚨 FAILURES DETECTED IN MULTIMODAL TEST RUNNER.");
    process.exit(1);
  }
}

runTestSuite();
