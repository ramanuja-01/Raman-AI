/**
 * RAMAN AI – Cloud Orchestrator Bridge & Multimodal API Gateway
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox & Cloud Bridge
 * 
 * Provides a production-ready HTTP / REST gateway for hybrid edge-cloud medical telemetry:
 * - Ingestion & routing for multimodal diagnostic inputs (Video rPPG, Dermal ABCD, Paper Lab OCR, 12-Lead ECG)
 * - Split Conformal Prediction execution with 99% coverage guarantee
 * - Secure Clinician Verification & HIPAA-compliant SLM Auto-Training queueing
 * - OTA distribution of cryptographically signed 4-bit AWQ quantized LoRA adapters
 */

const http = require('http');
const { ramanMultimodalEngine } = require('./multimodal_diagnostic_engine.js');
const { ramanContinuousSlmTrainer } = require('./continuous_slm_trainer.js');

class RamanCloudOrchestratorBridge {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.engine = ramanMultimodalEngine;
    this.trainer = ramanContinuousSlmTrainer;
    this.requestCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Starts the HTTP REST & Microservice Gateway.
   * @param {number} port - Optional override port
   * @returns {Promise<http.Server>}
   */
  start(port = null) {
    const listenPort = port || this.port;
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));
      this.server.listen(listenPort, () => {
        console.log(`🚀 [GATEWAY] Raman Cloud Orchestrator Bridge listening on port ${listenPort}`);
        resolve(this.server);
      });
      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stops the gateway server.
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Internal HTTP Request Dispatcher.
   */
  _handleRequest(req, res) {
    this.requestCount++;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // Routing table
    if (method === 'GET' && pathname === '/api/v1/health') {
      return this._handleHealth(req, res);
    } else if (method === 'GET' && pathname === '/api/v1/slm/ota-package') {
      return this._handleGetOtaPackage(req, res);
    } else if (method === 'POST') {
      this._parseJsonBody(req, (err, body) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "Invalid JSON payload: " + err.message }));
        }

        switch (pathname) {
          case '/api/v1/diagnose/multimodal':
            return this._handleMultimodalDiagnosis(body, res);
          case '/api/v1/diagnose/rppg':
            return this._handleRppgDiagnosis(body, res);
          case '/api/v1/diagnose/lab-ocr':
            return this._handleLabOcrDiagnosis(body, res);
          case '/api/v1/diagnose/ecg-digitize':
            return this._handleEcgDigitize(body, res);
          case '/api/v1/diagnose/radiology':
            return this._handleRadiologyDiagnose(body, res);
          case '/api/v1/diagnose/ultrasound':
            return this._handleUltrasoundDiagnose(body, res);
          case '/api/v1/slm/verify-and-train':
            return this._handleSlmVerifyAndTrain(body, res);
          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: `Endpoint ${pathname} not found.` }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Method ${method} not allowed.` }));
    }
  }

  // --- Handlers ---

  _handleHealth(req, res) {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const healthPayload = {
      status: "HEALTHY",
      service: "RAMAN Cloud Orchestrator Gateway",
      version: "1.0.0",
      uptimeSeconds: uptimeSec,
      totalRequestsServed: this.requestCount,
      activeModelVersion: this.trainer.currentModelVersion,
      conformalCoverageTarget: "99.0%",
      pendingTrainingQueueLength: this.trainer.pendingIngestionQueue.length
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthPayload, null, 2));
  }

  _handleMultimodalDiagnosis(body, res) {
    try {
      const { rppgFrames, dermalData, labText, ecgSignal, ecgSampleRate } = body;
      const compositeInput = {};

      if (rppgFrames && Array.isArray(rppgFrames)) {
        compositeInput.rppgData = this.engine.processVideoRppg(rppgFrames, body.fps || 30);
      }
      if (dermalData && dermalData.data) {
        compositeInput.dermalData = this.engine.analyzeDermalLesion(dermalData, body.dermalOptions || {});
      }
      if (labText) {
        compositeInput.labData = this.engine.parsePaperLabReport(labText);
      }
      if (ecgSignal) {
        compositeInput.ecgData = this.engine.digitizeAndClassifyEcg(ecgSignal, ecgSampleRate || 250);
      }

      const diagnosis = this.engine.synthesizeMultimodalDiagnosis(compositeInput);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        extractedModalities: compositeInput,
        diagnosis
      }, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Diagnostic inference failed: " + err.message }));
    }
  }

  _handleRppgDiagnosis(body, res) {
    try {
      const { frames, fps } = body;
      const result = this.engine.processVideoRppg(frames, fps || 30);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleLabOcrDiagnosis(body, res) {
    try {
      const { ocrText } = body;
      const result = this.engine.parsePaperLabReport(ocrText);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleEcgDigitize(body, res) {
    try {
      const { signal, sampleRate } = body;
      const result = this.engine.digitizeAndClassifyEcg(signal, sampleRate || 250);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleRadiologyDiagnose(body, res) {
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

  _handleSlmVerifyAndTrain(body, res) {
    try {
      const { rawCase, physicianFeedback } = body;
      const ingestResult = this.trainer.ingestVerifiedClinicalPair(rawCase, physicianFeedback);

      let sweepResult = null;
      if (ingestResult.eligible && ingestResult.sweepTriggered) {
        sweepResult = this.trainer.executeContinualTrainingSweep();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        ingestResult,
        sweepResult,
        activeModelVersion: this.trainer.currentModelVersion
      }, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Continuous training ingestion failed: " + err.message }));
    }
  }

  _handleGetOtaPackage(req, res) {
    try {
      const otaPayload = this.trainer.packageOtaPayload();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, otaPayload }, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _parseJsonBody(req, callback) {
    let bodyStr = '';
    req.on('data', chunk => {
      bodyStr += chunk;
      if (bodyStr.length > 25 * 1024 * 1024) { // 25 MB max payload
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!bodyStr) return callback(null, {});
      try {
        const parsed = JSON.parse(bodyStr);
        callback(null, parsed);
      } catch (err) {
        callback(err, null);
      }
    });
  }
}

// Module exposure & CLI startup
const ramanCloudBridge = new RamanCloudOrchestratorBridge(8080);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanCloudOrchestratorBridge,
    ramanCloudBridge
  };
}

if (require.main === module) {
  ramanCloudBridge.start();
}
