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
