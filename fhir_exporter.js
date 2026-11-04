/**
 * RAMAN AI – HL7 FHIR Release 4 (R4) Standardized Health Exporter
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Compiles patient profile, clinical triage observations, and prescriptions
 * into a standards-compliant HL7 FHIR R4 JSON Document Bundle.
 */

function generateFhirR4Bundle(profile, sessionData = {}, vitals = {}) {
  const healthId = sessionData.healthId || "RMN-UNKNOWN";
  const timestamp = new Date().toISOString();
  const patientId = `patient-${healthId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

  // 1. Patient Resource
  let birthDate = undefined;
  if (profile.age && !isNaN(parseInt(profile.age, 10))) {
    const approxYear = new Date().getFullYear() - parseInt(profile.age, 10);
    birthDate = `${approxYear}-01-01`;
  }

  const patientResource = {
    resourceType: "Patient",
    id: patientId,
    identifier: [
      {
        system: "https://raman.ai/health-id",
        value: healthId
      }
    ],
    active: true,
    name: profile.name ? [{ use: "official", text: profile.name }] : undefined,
    gender: (profile.gender && ["male", "female", "other"].includes(profile.gender.toLowerCase()))
      ? profile.gender.toLowerCase()
      : "unknown",
    birthDate: birthDate,
    extension: []
  };

  if (profile.blood) {
    patientResource.extension.push({
      url: "http://hl7.org/fhir/StructureDefinition/patient-bloodGroup",
      valueString: profile.blood
    });
  }

  const entries = [
    {
      fullUrl: `urn:uuid:${patientId}`,
      resource: patientResource
    }
  ];

  // 2. Condition Resource (ICD-11 Diagnostic Classification)
  const conditionName = sessionData.condition || "Clinical Observation";
  const icd11Code = sessionData.icd11 || "UNASSIGNED";
  const conditionId = `condition-${healthId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}-01`;

  const conditionResource = {
    resourceType: "Condition",
    id: conditionId,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: "active",
          display: "Active"
        }
      ]
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: "provisional",
          display: "Provisional"
        }
      ]
    },
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-category",
            code: "encounter-diagnosis",
            display: "Encounter Diagnosis"
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: "http://id.who.int/icd/release/11/mms",
          code: icd11Code,
          display: conditionName
        }
      ],
      text: conditionName
    },
    subject: {
      reference: `urn:uuid:${patientId}`,
      display: profile.name || "Patient"
    },
    recordedDate: timestamp
  };

  entries.push({
    fullUrl: `urn:uuid:${conditionId}`,
    resource: conditionResource
  });

  // 3. Observations (LOINC Vital Signs)
  const activeVitals = {
    hr: vitals.heartRate || profile.heartRate,
    spo2: vitals.SpO2 || profile.SpO2,
    bp: vitals.bp || profile.bp,
    temp: vitals.temp || profile.temp
  };

  // 3A. Heart Rate (LOINC 8867-4)
  if (activeVitals.hr && !isNaN(parseFloat(activeVitals.hr))) {
    const hrVal = parseFloat(activeVitals.hr);
    entries.push({
      fullUrl: `urn:uuid:obs-hr-${Date.now()}`,
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs"
          }]
        }],
        code: {
          coding: [{
            system: "http://loinc.org",
            code: "8867-4",
            display: "Heart rate"
          }]
        },
        subject: { reference: `urn:uuid:${patientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: hrVal,
          unit: "beats/minute",
          system: "http://unitsofmeasure.org",
          code: "/min"
        }
      }
    });
  }

  // 3B. Oxygen Saturation (LOINC 2708-6)
  if (activeVitals.spo2 && !isNaN(parseFloat(activeVitals.spo2))) {
    const spo2Val = parseFloat(activeVitals.spo2);
    entries.push({
      fullUrl: `urn:uuid:obs-spo2-${Date.now()}`,
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs"
          }]
        }],
        code: {
          coding: [{
            system: "http://loinc.org",
            code: "2708-6",
            display: "Oxygen saturation in Arterial blood"
          }]
        },
        subject: { reference: `urn:uuid:${patientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: spo2Val,
          unit: "%",
          system: "http://unitsofmeasure.org",
          code: "%"
        }
      }
    });
  }

  // 3C. Blood Pressure (LOINC 85354-9)
  if (activeVitals.bp && activeVitals.bp.includes("/")) {
    const parts = activeVitals.bp.split("/");
    const sys = parseFloat(parts[0]);
    const dia = parseFloat(parts[1]);
    if (!isNaN(sys) && !isNaN(dia)) {
      entries.push({
        fullUrl: `urn:uuid:obs-bp-${Date.now()}`,
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs"
            }]
          }],
          code: {
            coding: [{
              system: "http://loinc.org",
              code: "85354-9",
              display: "Blood pressure panel with all children optional"
            }]
          },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: timestamp,
          component: [
            {
              code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" }] },
              valueQuantity: { value: sys, unit: "mm[Hg]", system: "http://unitsofmeasure.org", code: "mm[Hg]" }
            },
            {
              code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }] },
              valueQuantity: { value: dia, unit: "mm[Hg]", system: "http://unitsofmeasure.org", code: "mm[Hg]" }
            }
          ]
        }
      });
    }
  }

  // 3D. Step Count (LOINC 55423-8: Number of steps in 24 hour Measured)
  const rawSteps = vitals.steps || profile.steps || (typeof window !== 'undefined' && window.ramanBle ? window.ramanBle.steps : 0);
  const stepsNum = parseInt(rawSteps, 10);
  if (!isNaN(stepsNum) && stepsNum > 0) {
    entries.push({
      fullUrl: `urn:uuid:obs-steps-${Date.now()}`,
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "activity",
            display: "Activity"
          }]
        }],
        code: {
          coding: [{
            system: "http://loinc.org",
            code: "55423-8",
            display: "Number of steps in 24 hour Measured"
          }]
        },
        subject: { reference: `urn:uuid:${patientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: stepsNum,
          unit: "steps",
          system: "http://unitsofmeasure.org",
          code: "{steps}"
        }
      }
    });
  }

  // 3E. Clinical Triage Score Observations (NEWS2, qSOFA, Shock Index, eGFR)
  const clinicalScores = sessionData.clinicalScores || 
    (typeof calculateClinicalScores === 'function' ? calculateClinicalScores(activeVitals, profile) : null);

  if (clinicalScores) {
    // 3E-1. NEWS2 Total Score (LOINC 96552-5)
    if (clinicalScores.news2 && typeof clinicalScores.news2.score === 'number') {
      entries.push({
        fullUrl: `urn:uuid:obs-news2-${Date.now()}`,
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "survey",
              display: "Survey"
            }]
          }],
          code: {
            coding: [{
              system: "http://loinc.org",
              code: "96552-5",
              display: "National Early Warning Score 2 total"
            }]
          },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: timestamp,
          valueInteger: clinicalScores.news2.score,
          interpretation: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
              code: clinicalScores.news2.tier,
              display: clinicalScores.news2.risk
            }]
          }]
        }
      });
    }

    // 3E-2. qSOFA Sepsis Screening Score (LOINC 96790-1)
    if (clinicalScores.qsofa && typeof clinicalScores.qsofa.score === 'number') {
      entries.push({
        fullUrl: `urn:uuid:obs-qsofa-${Date.now()}`,
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "survey",
              display: "Survey"
            }]
          }],
          code: {
            coding: [{
              system: "http://loinc.org",
              code: "96790-1",
              display: "quick Sequential Organ Failure Assessment total score"
            }]
          },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: timestamp,
          valueInteger: clinicalScores.qsofa.score,
          note: [{ text: clinicalScores.qsofa.recommendation }]
        }
      });
    }

    // 3E-3. Shock Index (LOINC 76503-2)
    if (clinicalScores.shockIndex && typeof clinicalScores.shockIndex.value === 'number') {
      entries.push({
        fullUrl: `urn:uuid:obs-si-${Date.now()}`,
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs",
              display: "Vital Signs"
            }]
          }],
          code: {
            coding: [{
              system: "http://loinc.org",
              code: "76503-2",
              display: "Shock Index"
            }]
          },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: timestamp,
          valueQuantity: {
            value: clinicalScores.shockIndex.value,
            unit: "{beats/min}/{mmHg}",
            system: "http://unitsofmeasure.org",
            code: "{beats/min}/{mm[Hg]}"
          },
          interpretation: [{
            text: clinicalScores.shockIndex.status
          }]
        }
      });
    }

    // 3E-4. Renal Creatinine Clearance / eGFR (LOINC 33914-3)
    if (clinicalScores.renal && typeof clinicalScores.renal.crclMlMin === 'number') {
      entries.push({
        fullUrl: `urn:uuid:obs-crcl-${Date.now()}`,
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory"
            }]
          }],
          code: {
            coding: [{
              system: "http://loinc.org",
              code: "33914-3",
              display: "Glomerular filtration rate/1.73 sq M.predicted"
            }]
          },
          subject: { reference: `urn:uuid:${patientId}` },
          effectiveDateTime: timestamp,
          valueQuantity: {
            value: clinicalScores.renal.crclMlMin,
            unit: "mL/min/1.73m2",
            system: "http://unitsofmeasure.org",
            code: "mL/min/1.73m2"
          },
          interpretation: [{
            text: clinicalScores.renal.stage
          }]
        }
      });
    }
  }

  // 3F. AllergyIntolerance Resource (International Patient Summary Standard)
  const allergiesStr = (profile.allergies || "").toLowerCase().trim();
  if (allergiesStr && allergiesStr !== "none") {
    let allergenSnomed = "419199007";
    let allergenDisplay = profile.allergies;

    if (allergiesStr.includes("penicillin")) {
      allergenSnomed = "91936005";
      allergenDisplay = "Allergy to penicillin";
    } else if (allergiesStr.includes("nsaid") || allergiesStr.includes("aspirin")) {
      allergenSnomed = "292044008";
      allergenDisplay = "Allergy to aspirin / NSAID";
    } else if (allergiesStr.includes("sulfa")) {
      allergenSnomed = "91939003";
      allergenDisplay = "Allergy to sulfonamide";
    }

    entries.push({
      fullUrl: `urn:uuid:allergy-${Date.now()}`,
      resource: {
        resourceType: "AllergyIntolerance",
        clinicalStatus: {
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: "active",
            display: "Active"
          }]
        },
        verificationStatus: {
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: "confirmed",
            display: "Confirmed"
          }]
        },
        type: "allergy",
        category: ["medication"],
        criticality: "high",
        code: {
          coding: [{
            system: "http://snomed.info/sct",
            code: allergenSnomed,
            display: allergenDisplay
          }],
          text: profile.allergies
        },
        patient: { reference: `urn:uuid:${patientId}` },
        recordedDate: timestamp
      }
    });
  }

  // 3G. Wearable Device Resource (if connected)
  const deviceModel = vitals.deviceModel || profile.deviceModel || (typeof window !== 'undefined' && window.ramanBle && window.ramanBle.deviceModel ? window.ramanBle.deviceModel : null);
  if (deviceModel) {
    const devId = `device-${healthId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}-wearable`;
    entries.push({
      fullUrl: `urn:uuid:${devId}`,
      resource: {
        resourceType: "Device",
        id: devId,
        status: "active",
        deviceName: [
          {
            name: deviceModel,
            type: "user-friendly-name"
          }
        ],
        type: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "86184003",
              display: "Wearable device"
            }
          ],
          text: deviceModel
        },
        patient: { reference: `urn:uuid:${patientId}` }
      }
    });
  }

  // 4. Medication Statements (SNOMED CT coded)
  const medications = sessionData.medications || [];
  medications.forEach((med, idx) => {
    entries.push({
      fullUrl: `urn:uuid:med-${idx}-${Date.now()}`,
      resource: {
        resourceType: "MedicationStatement",
        status: "active",
        medicationCodeableConcept: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: med.snomed || "372692003",
              display: med.name
            }
          ],
          text: med.name
        },
        subject: { reference: `urn:uuid:${patientId}` },
        dosage: [
          {
            text: med.dose || "As directed by physician"
          }
        ],
        note: med.note ? [{ text: med.note }] : undefined
      }
    });
  });

  // Assemble Complete FHIR Document Bundle
  const bundle = {
    resourceType: "Bundle",
    id: `raman-consult-${healthId.toLowerCase()}`,
    identifier: {
      system: "https://raman.ai/bundles",
      value: `BUNDLE-${healthId}`
    },
    type: "document",
    timestamp: timestamp,
    total: entries.length,
    entry: entries
  };

  return bundle;
}

function downloadFhirR4Json(profile, sessionData, vitals) {
  const bundle = generateFhirR4Bundle(profile, sessionData, vitals);
  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: "application/fhir+json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  const hid = (sessionData && sessionData.healthId) ? sessionData.healthId : "export";
  a.href = url;
  a.download = `raman_fhir_r4_${hid}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (typeof window !== 'undefined' && window.BioTelemetrySFX) {
    window.BioTelemetrySFX.playSuccess();
  }
  return bundle;
}

if (typeof window !== 'undefined') {
  window.generateFhirR4Bundle = generateFhirR4Bundle;
  window.downloadFhirR4Json = downloadFhirR4Json;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateFhirR4Bundle,
    downloadFhirR4Json
  };
}
