/**
 * RAMAN AI – Automated Cloud Orchestrator Bridge & REST Gateway Test Runner
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox & Cloud Bridge
 */

const http = require('http');
const { RamanCloudOrchestratorBridge } = require('../cloud_orchestrator_bridge.js');

console.log("==================================================================");
console.log("🌐 RAMAN AI: CLOUD ORCHESTRATOR BRIDGE & REST API TEST RUNNER");
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

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runCloudBridgeTests() {
  const TEST_PORT = 8099;
  const bridge = new RamanCloudOrchestratorBridge(TEST_PORT);

  try {
    await bridge.start();

    // 1. Test GET /api/v1/health
    console.log("🏃 Test 01: Gateway Health Check (GET /api/v1/health)");
    {
      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/health',
        method: 'GET'
      });

      assert(res.statusCode === 200, `Health check returned HTTP 200 (Got: ${res.statusCode}).`);
      assert(res.body.status === "HEALTHY", "Gateway status is HEALTHY.");
      assert(res.body.conformalCoverageTarget === "99.0%", "Conformal coverage target confirmed at 99%.");
      assert(Boolean(res.body.activeModelVersion), `Active model version reported: ${res.body.activeModelVersion}.`);
    }

    // 2. Test POST /api/v1/diagnose/rppg
    console.log("\n🏃 Test 02: Video rPPG Ingestion (POST /api/v1/diagnose/rppg)");
    {
      const mockFrames = [];
      for (let i = 0; i < 90; i++) {
        mockFrames.push({
          r: 180,
          g: 130 + 15 * Math.sin(2 * Math.PI * 1.2 * (i / 30)),
          b: 110,
          t: i / 30
        });
      }

      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/diagnose/rppg',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { frames: mockFrames, fps: 30 });

      assert(res.statusCode === 200, `rPPG API returned HTTP 200.`);
      assert(res.body.success === true, "rPPG execution flagged success.");
      assert(res.body.result.heartRateBpm >= 65 && res.body.result.heartRateBpm <= 85, `Computed heart rate within expected range: ${res.body.result.heartRateBpm} BPM.`);
    }

    // 3. Test POST /api/v1/diagnose/lab-ocr
    console.log("\n🏃 Test 03: Paper Lab OCR Ingestion (POST /api/v1/diagnose/lab-ocr)");
    {
      const sampleOcr = `
        BIOCHEMISTRY REPORT
        Troponin I hs: 65.4 pg/mL [HIGH]
        Serum Creatinine: 2.1 mg/dL [HIGH]
        Potassium: 4.8 mmol/L [NORMAL]
      `;

      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/diagnose/lab-ocr',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { ocrText: sampleOcr });

      assert(res.statusCode === 200, `Lab OCR API returned HTTP 200.`);
      assert(res.body.result.totalAnalytesFound >= 3, `Extracted ${res.body.result.totalAnalytesFound} analytes.`);
      const trop = res.body.result.analytes.find(a => a.key === "TROPONIN_I");
      assert(trop && trop.value === 65.4, "Troponin value extracted: 65.4 pg/mL.");
    }

    // 4. Test POST /api/v1/diagnose/multimodal
    console.log("\n🏃 Test 04: Multimodal Synthesis & Conformal Prediction (POST /api/v1/diagnose/multimodal)");
    {
      const mockMultimodalPayload = {
        labText: "Troponin I: 55.0 pg/mL\nPotassium: 5.4 mmol/L",
        ecgSignal: new Array(500).fill(0.0),
        ecgSampleRate: 250
      };

      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/diagnose/multimodal',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, mockMultimodalPayload);

      assert(res.statusCode === 200, "Multimodal fusion API returned HTTP 200.");
      assert(Boolean(res.body.diagnosis), "Diagnosis object generated.");
      assert(Array.isArray(res.body.diagnosis.conformalPredictionSet), "Conformal prediction set generated.");
      assert(res.body.diagnosis.conformalCoverageTarget === "99.0%", "Coverage target verified at 99%.");
    }

    // 5. Test POST /api/v1/slm/verify-and-train
    console.log("\n🏃 Test 05: Clinician Verification & Training Queue (POST /api/v1/slm/verify-and-train)");
    {
      const verificationPayload = {
        rawCase: {
          rawText: "Patient presents with crushing chest discomfort",
          opticalScore: 0.95,
          signalScore: 0.92,
          initialModelDraft: "Mild muscular pain"
        },
        physicianFeedback: {
          approvedDiagnosis: "Acute Coronary Syndrome",
          physicianNotes: "Verified clinical STEMI. Transferred to cath lab.",
          signatureValid: true,
          isSpecialist: true
        }
      };

      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/slm/verify-and-train',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, verificationPayload);

      assert(res.statusCode === 200, "SLM training ingestion returned HTTP 200.");
      assert(res.body.ingestResult.eligible === true, "Case accepted into continuous training stream.");
      assert(res.body.ingestResult.compositeQuality >= 0.85, "Composite quality passed threshold.");
    }

    // 6. Test GET /api/v1/slm/ota-package
    console.log("\n🏃 Test 06: OTA Adapter Package Download (GET /api/v1/slm/ota-package)");
    {
      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/slm/ota-package',
        method: 'GET'
      });

      assert(res.statusCode === 200, "OTA package endpoint returned HTTP 200.");
      assert(res.body.otaPayload.quantization === "INT4_AWQ", "Adapter weights compressed with 4-bit AWQ.");
      assert(Boolean(res.body.otaPayload.cryptographicSignature), "OTA payload includes cryptographic signature.");
    }

    // 7. Test POST /api/v1/diagnose/radiology
    console.log("\n🏃 Test 07: Chest X-Ray Ingestion (POST /api/v1/diagnose/radiology)");
    {
      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/diagnose/radiology',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { cardiothoracicRatio: 0.55, hasConsolidation: true });

      assert(res.statusCode === 200, "Radiology endpoint returned HTTP 200.");
      assert(res.body.result.isCardiomegaly === true, "Cardiomegaly detected by cloud gateway.");
      assert(res.body.result.hasConsolidation === true, "Pulmonary consolidation identified.");
    }

    // 8. Test POST /api/v1/diagnose/ultrasound
    console.log("\n🏃 Test 08: Ultrasound Echocardiogram Telemetry (POST /api/v1/diagnose/ultrasound)");
    {
      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/v1/diagnose/ultrasound',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { endDiastolicVolumeMl: 120, endSystolicVolumeMl: 75 });

      assert(res.statusCode === 200, "Ultrasound endpoint returned HTTP 200.");
      assert(res.body.result.lvefPercent === 37.5, "LVEF accurately computed: 37.5%.");
      assert(res.body.result.isHeartFailure === true, "Heart failure detected based on reduced LVEF.");
    }

    console.log("\n==================================================================");
    console.log("📊 CLOUD ORCHESTRATOR BRIDGE TEST SUMMARY");
    console.log("==================================================================");
    console.log(`Total Passed Assertions: ${passes}`);
    console.log(`Total Failed Assertions: ${fails}`);

    if (fails === 0) {
      console.log("🌟 CLOUD ORCHESTRATOR GATEWAY REST API FUNCTIONING FLAWLESSLY!");
    } else {
      console.error("🚨 FAILURES DETECTED IN CLOUD GATEWAY.");
    }

  } finally {
    await bridge.stop();
    console.log("🛑 Gateway server shut down cleanly.");
    process.exit(fails === 0 ? 0 : 1);
  }
}

runCloudBridgeTests();
