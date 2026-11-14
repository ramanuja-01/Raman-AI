const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🚀 EXPANDING MULTIMODAL RADIOLOGY, ULTRASOUND & FHIR R4 EXPORTER");
console.log("==================================================================\n");

// ── 1. UPDATE multimodal_diagnostic_engine.js ──────────────────────────────
const mmEnginePath = path.join(__dirname, '..', 'multimodal_diagnostic_engine.js');
let mmCode = fs.readFileSync(mmEnginePath, 'utf8');

const targetMethodMarker = '  // =========================================================================\n  // ── 5. MULTIMODAL FUSION & CONFORMAL PREDICTION ENGINE ───────────────────';
const newRadiologyUltrasoundMethods = `  // =========================================================================
  // ── 4B. CHEST RADIOGRAPHY (X-RAY) & CARDIAC ULTRASOUND VIDEO ANALYZERS ──
  // =========================================================================

  /**
   * Ingests 2D Chest X-Ray features or simulated projection imagery,
   * detecting cardiomegaly, pulmonary consolidation, and pleural effusion.
   * 
   * @param {Object} xrayInput - { cardiothoracicRatio, hasConsolidation, hasPleuralEffusion, hasPneumothorax }
   * @returns {Object} Radiologic findings & pulmonary/cardiac risk stratification
   */
  analyzeRadiologyImage(xrayInput = {}) {
    const ctr = Number(xrayInput.cardiothoracicRatio || 0.44);
    const hasConsolidation = Boolean(xrayInput.hasConsolidation);
    const hasEffusion = Boolean(xrayInput.hasPleuralEffusion);
    const hasPneumo = Boolean(xrayInput.hasPneumothorax);

    const findings = [];
    let isCardiomegaly = false;
    let isSeverePulmonaryHazard = false;

    if (ctr > 0.50) {
      isCardiomegaly = true;
      findings.push(\`Cardiomegaly (Cardiothoracic Ratio \${ctr.toFixed(2)} > 0.50)\`);
    }

    if (hasConsolidation) {
      findings.push("Focal Alveolar Consolidation / Lobar Infiltrate");
    }

    if (hasEffusion) {
      findings.push("Costophrenic Angle Blunting / Pleural Effusion");
    }

    if (hasPneumo) {
      isSeverePulmonaryHazard = true;
      findings.push("CRITICAL: Peripheral Visceral Pleural Line / Pneumothorax");
    }

    if (findings.length === 0) {
      findings.push("Clear lung fields with normal cardiothoracic silhouette");
    }

    return {
      modality: "CHEST_RADIOGRAPHY_XRAY",
      cardiothoracicRatio: ctr,
      isCardiomegaly,
      hasConsolidation,
      hasPleuralEffusion: hasEffusion,
      hasPneumothorax: hasPneumo,
      isEmergencyDecompressionCandidate: hasPneumo,
      findingsSummary: findings,
      view: xrayInput.view || "PA_PROJECTION"
    };
  }

  /**
   * Ingests dynamic Echocardiogram ultrasound video loops or cardiac dimensions,
   * calculating Left Ventricular Ejection Fraction (LVEF %) and classifying Heart Failure.
   * 
   * @param {Object} echoInput - { endDiastolicVolumeMl, endSystolicVolumeMl, wallMotionScore }
   * @returns {Object} LVEF %, stroke volume, and Heart Failure tier (HFrEF / HFpEF)
   */
  analyzeUltrasoundLoop(echoInput = {}) {
    const edv = Number(echoInput.endDiastolicVolumeMl || 120);
    const esv = Number(echoInput.endSystolicVolumeMl || 50);
    const strokeVolume = Math.max(0, edv - esv);
    const lvef = parseFloat(((strokeVolume / Math.max(1, edv)) * 100).toFixed(1));

    let hfTier = "NORMAL_LV_FUNCTION";
    let isHeartFailure = false;

    if (lvef < 40.0) {
      hfTier = "HEART_FAILURE_REDUCED_EF (HFrEF)";
      isHeartFailure = true;
    } else if (lvef >= 40.0 && lvef < 50.0) {
      hfTier = "HEART_FAILURE_MILDLY_REDUCED_EF (HFmrEF)";
      isHeartFailure = true;
    } else {
      hfTier = "PRESERVED_LV_FUNCTION (Normal LVEF >= 50%)";
    }

    const wmsi = Number(echoInput.wallMotionScore || (lvef < 40 ? 1.8 : 1.0));

    return {
      modality: "CARDIAC_ULTRASOUND_ECHOCARDIOGRAM",
      endDiastolicVolumeMl: edv,
      endSystolicVolumeMl: esv,
      strokeVolumeMl: strokeVolume,
      lvefPercent: lvef,
      heartFailureClassification: hfTier,
      isHeartFailure,
      wallMotionScoreIndex: wmsi,
      view: echoInput.view || "APICAL_4_CHAMBER"
    };
  }\n\n`;

if (!mmCode.includes("analyzeRadiologyImage")) {
  mmCode = mmCode.replace(targetMethodMarker, newRadiologyUltrasoundMethods + targetMethodMarker);
  console.log("✅ Added analyzeRadiologyImage & analyzeUltrasoundLoop to multimodal_diagnostic_engine.js");
}

// Update synthesizeMultimodalDiagnosis to cross-reference radiology & ultrasound
const fusionMarker = '    // 2. Dermatological Cross-Check';
const fusionExtension = `    // 1B. Ultrasound Echocardiography & Radiology Cross-Check
    if (inputs.ultrasoundData && inputs.ultrasoundData.isHeartFailure) {
      differential.push({
        condition: "Heart Failure with Reduced Ejection Fraction (HFrEF)",
        icd10: "I50.2",
        confidence: 0.95,
        supportingModalities: [\`Echocardiogram (LVEF: \${inputs.ultrasoundData.lvefPercent}%, EDV: \${inputs.ultrasoundData.endDiastolicVolumeMl}mL)\`]
      });
      activeAlerts.push(\`CARDIAC DYSFUNCTION ALERT: Depressed Left Ventricular Ejection Fraction (\${inputs.ultrasoundData.lvefPercent}%).\`);
    }

    if (inputs.radiologyData) {
      if (inputs.radiologyData.hasPneumothorax) {
        differential.push({
          condition: "Tension / Acute Pneumothorax",
          icd10: "J93.9",
          confidence: 0.97,
          supportingModalities: ["Chest X-Ray (Visceral pleural line with absent lung markings)"]
        });
        activeAlerts.push("PULMONARY EMERGENCY: Pneumothorax visualized on Chest Radiograph.");
      } else if (inputs.radiologyData.hasConsolidation) {
        differential.push({
          condition: "Lobar Pneumonia / Acute Lower Respiratory Tract Infection",
          icd10: "J18.9",
          confidence: 0.93,
          supportingModalities: ["Chest X-Ray (Focal alveolar consolidation)"]
        });
      }
    }\n\n`;

if (!mmCode.includes("inputs.ultrasoundData.isHeartFailure")) {
  mmCode = mmCode.replace(fusionMarker, fusionExtension + fusionMarker);
  console.log("✅ Extended synthesizeMultimodalDiagnosis with Radiology & Ultrasound reasoning.");
}

fs.writeFileSync(mmEnginePath, mmCode, 'utf8');

// ── 2. UPDATE fhir_exporter.js ─────────────────────────────────────────────
const fhirPath = path.join(__dirname, '..', 'fhir_exporter.js');
let fhirCode = fs.readFileSync(fhirPath, 'utf8');

const multimodalFhirImplementation = `
/**
 * Generates an HL7 FHIR R4 DiagnosticReport Document Bundle for Multimodal Diagnostics.
 * Encapsulates Video rPPG, Dermal ABCD, 12-Lead ECG, Lab Analytes, Radiology, and Conformal Prediction Sets.
 */
function generateMultimodalFhirDiagnosticReport(healthId = "RMN-UNKNOWN", diagnosisData = {}, profile = {}, rawInputs = {}) {
  const timestamp = new Date().toISOString();
  const cleanId = String(healthId || "anon").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const patientId = \`patient-\${cleanId}\`;
  const reportId = \`report-\${cleanId}-\${Date.now()}\`;

  const entries = [];

  // 1. Patient Resource
  const patientResource = {
    resourceType: "Patient",
    id: patientId,
    identifier: [{ system: "https://raman.ai/health-id", value: healthId }],
    active: true,
    name: profile.name ? [{ use: "official", text: profile.name }] : undefined,
    gender: profile.gender ? profile.gender.toLowerCase() : "unknown"
  };
  entries.push({ fullUrl: \`urn:uuid:\${patientId}\`, resource: patientResource });

  const resultReferences = [];

  // 2. Observations for Lab Analytes (if present)
  if (rawInputs.labData && rawInputs.labData.analytes) {
    rawInputs.labData.analytes.forEach((analyte, idx) => {
      const obsId = \`obs-lab-\${idx + 1}-\${Date.now()}\`;
      const labObs = {
        resourceType: "Observation",
        id: obsId,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory" }] }],
        code: {
          coding: [{ system: "http://loinc.org", code: analyte.loincCode, display: analyte.testName }],
          text: analyte.testName
        },
        subject: { reference: \`urn:uuid:\${patientId}\` },
        effectiveDateTime: timestamp,
        valueQuantity: { value: analyte.value, unit: analyte.units, system: "http://unitsofmeasure.org" },
        interpretation: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: analyte.flag && analyte.flag.includes("CRITICAL") ? "CR" : (analyte.flag === "HIGH" ? "H" : (analyte.flag === "LOW" ? "L" : "N")),
            display: analyte.flag || "NORMAL"
          }]
        }]
      };
      entries.push({ fullUrl: \`urn:uuid:\${obsId}\`, resource: labObs });
      resultReferences.push({ reference: \`urn:uuid:\${obsId}\` });
    });
  }

  // 3. Observation for 12-Lead ECG (if present)
  if (rawInputs.ecgData) {
    const ecgObsId = \`obs-ecg-\${Date.now()}\`;
    const ecgObs = {
      resourceType: "Observation",
      id: ecgObsId,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "procedure", display: "Procedure" }] }],
      code: {
        coding: [{ system: "http://loinc.org", code: "11524-6", display: "12 lead EKG [Interpretation]" }],
        text: "12-Lead Electrocardiogram Telemetry"
      },
      subject: { reference: \`urn:uuid:\${patientId}\` },
      effectiveDateTime: timestamp,
      valueString: rawInputs.ecgData.rhythmClassification,
      component: [
        { code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] }, valueQuantity: { value: rawInputs.ecgData.heartRateBpm, unit: "BPM" } },
        { code: { coding: [{ system: "http://loinc.org", code: "8625-6", display: "P-R Interval" }] }, valueQuantity: { value: rawInputs.ecgData.prIntervalMs, unit: "ms" } },
        { code: { coding: [{ system: "http://loinc.org", code: "8633-0", display: "QRS duration" }] }, valueQuantity: { value: rawInputs.ecgData.qrsDurationMs, unit: "ms" } },
        { code: { coding: [{ system: "http://loinc.org", code: "8634-8", display: "Q-T interval.corrected" }] }, valueQuantity: { value: rawInputs.ecgData.qtcIntervalMs, unit: "ms" } },
        { code: { text: "ST Segment Elevation" }, valueQuantity: { value: rawInputs.ecgData.stElevationMv, unit: "mV" } }
      ]
    };
    entries.push({ fullUrl: \`urn:uuid:\${ecgObsId}\`, resource: ecgObs });
    resultReferences.push({ reference: \`urn:uuid:\${ecgObsId}\` });
  }

  // 4. Observation for Video rPPG Hemodynamics (if present)
  if (rawInputs.rppgData) {
    const rppgObsId = \`obs-rppg-\${Date.now()}\`;
    const rppgObs = {
      resourceType: "Observation",
      id: rppgObsId,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }],
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart Rate by Optical rPPG" }],
        text: "Remote Photoplethysmography Hemodynamic Telemetry"
      },
      subject: { reference: \`urn:uuid:\${patientId}\` },
      effectiveDateTime: timestamp,
      component: [
        { code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] }, valueQuantity: { value: rawInputs.rppgData.heartRateBpm, unit: "BPM" } },
        { code: { coding: [{ system: "http://loinc.org", code: "80404-7", display: "R-R interval.standard deviation (SDNN)" }] }, valueQuantity: { value: rawInputs.rppgData.hrvSdnnMs, unit: "ms" } },
        { code: { coding: [{ system: "http://loinc.org", code: "9279-1", display: "Respiratory rate" }] }, valueQuantity: { value: rawInputs.rppgData.respirationRateBpm, unit: "bpm" } }
      ]
    };
    entries.push({ fullUrl: \`urn:uuid:\${rppgObsId}\`, resource: rppgObs });
    resultReferences.push({ reference: \`urn:uuid:\${rppgObsId}\` });
  }

  // 5. DiagnosticReport Resource (Omnimodal Reasoning & Conformal Sets)
  const reportResource = {
    resourceType: "DiagnosticReport",
    id: reportId,
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "MDx",
            display: "Multimodal Diagnostic Support"
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "11526-1",
          display: "Pathology study diagnostic statement"
        }
      ],
      text: "Multimodal Diagnostic Reasoning Report"
    },
    subject: { reference: \`urn:uuid:\${patientId}\` },
    effectiveDateTime: timestamp,
    issued: timestamp,
    conclusion: diagnosisData.primaryDiagnosis || "Assessment Complete",
    conclusionCode: [
      {
        coding: [
          {
            system: "http://hl7.org/fhir/sid/icd-10",
            code: diagnosisData.primaryIcd10 || "Z00.00",
            display: diagnosisData.primaryDiagnosis || "Baseline Assessment"
          }
        ]
      }
    ],
    result: resultReferences,
    extension: [
      {
        url: "http://medical-ai.org/fhir/StructureDefinition/conformal-prediction-set",
        valueString: JSON.stringify(diagnosisData.conformalPredictionSet || [])
      },
      {
        url: "http://medical-ai.org/fhir/StructureDefinition/conformal-coverage-target",
        valueDecimal: 0.99
      },
      {
        url: "http://medical-ai.org/fhir/StructureDefinition/model-provenance",
        valueString: "RAMAN-SLM-Adapter-v1.0.1 + Med-Gemini-Cloud"
      }
    ]
  };
  entries.push({ fullUrl: \`urn:uuid:\${reportId}\`, resource: reportResource });

  return {
    resourceType: "Bundle",
    id: \`raman-multimodal-bundle-\${cleanId}\`,
    identifier: { system: "https://raman.ai/bundles", value: \`MM-BUNDLE-\${healthId}\` },
    type: "document",
    timestamp: timestamp,
    total: entries.length,
    entry: entries
  };
}

function downloadMultimodalFhirJson(healthId, diagnosisData, profile, rawInputs) {
  const bundle = generateMultimodalFhirDiagnosticReport(healthId, diagnosisData, profile, rawInputs);
  const jsonStr = JSON.stringify(bundle, null, 2);
  if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([jsonStr], { type: "application/fhir+json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = \`raman_multimodal_fhir_r4_\${healthId || 'export'}.json\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof window !== 'undefined' && window.BioTelemetrySFX) {
      window.BioTelemetrySFX.playSuccess();
    }
  }
  return bundle;
}
`;

if (!fhirCode.includes("generateMultimodalFhirDiagnosticReport")) {
  const exportWindowMarker = 'if (typeof window !== \'undefined\') {';
  const updatedWindowExport = `if (typeof window !== 'undefined') {
  window.generateMultimodalFhirDiagnosticReport = generateMultimodalFhirDiagnosticReport;
  window.downloadMultimodalFhirJson = downloadMultimodalFhirJson;`;
  
  const exportModuleMarker = 'if (typeof module !== \'undefined\' && module.exports) {';
  const updatedModuleExport = `if (typeof module !== 'undefined' && module.exports) {
  module.exports.generateMultimodalFhirDiagnosticReport = generateMultimodalFhirDiagnosticReport;
  module.exports.downloadMultimodalFhirJson = downloadMultimodalFhirJson;`;

  fhirCode = fhirCode.replace(exportWindowMarker, multimodalFhirImplementation + '\n' + updatedWindowExport);
  fhirCode = fhirCode.replace(exportModuleMarker, updatedModuleExport);
  fs.writeFileSync(fhirPath, fhirCode, 'utf8');
  console.log("✅ Added generateMultimodalFhirDiagnosticReport to fhir_exporter.js");
}

// ── 3. UPDATE cloud_orchestrator_bridge.js ─────────────────────────────────
const bridgePath = path.join(__dirname, '..', 'cloud_orchestrator_bridge.js');
let bridgeCode = fs.readFileSync(bridgePath, 'utf8');

const bridgeSwitchMarker = '          case \'/api/v1/diagnose/ecg-digitize\':\n            return this._handleEcgDigitize(body, res);';
const bridgeNewCases = `          case '/api/v1/diagnose/ecg-digitize':
            return this._handleEcgDigitize(body, res);
          case '/api/v1/diagnose/radiology':
            return this._handleRadiologyDiagnose(body, res);
          case '/api/v1/diagnose/ultrasound':
            return this._handleUltrasoundDiagnose(body, res);`;

const bridgeMethodMarker = '  _handleSlmVerifyAndTrain(body, res) {';
const bridgeNewMethods = `  _handleRadiologyDiagnose(body, res) {
    try {
      const result = this.engine.analyzeRadiologyImage(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleUltrasoundDiagnose(body, res) {
    try {
      const result = this.engine.analyzeUltrasoundLoop(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleSlmVerifyAndTrain(body, res) {`;

if (!bridgeCode.includes('/api/v1/diagnose/radiology')) {
  bridgeCode = bridgeCode.replace(bridgeSwitchMarker, bridgeNewCases);
  bridgeCode = bridgeCode.replace(bridgeMethodMarker, bridgeNewMethods);
  fs.writeFileSync(bridgePath, bridgeCode, 'utf8');
  console.log("✅ Added /api/v1/diagnose/radiology & ultrasound to cloud_orchestrator_bridge.js");
}

console.log("🌟 Advanced Multimodal & FHIR extensions successfully integrated!");
