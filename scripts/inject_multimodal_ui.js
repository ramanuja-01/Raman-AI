const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Add Multimodal Hub Button in Header right after btnTrainingHub
const btnTrainingHubMarker = '<!-- SLM Training Hub Button -->';
if (!html.includes('id="btnMultimodalHub"')) {
  const hubButton = `<!-- Multimodal Diagnostics Hub Button -->\n          <button class="btn-session-mgr" id="btnMultimodalHub" onclick="openMultimodalHub()" style="margin-right: 5px; border-color: #00f3ff !important; color: #00f3ff !important; box-shadow: 0 0 8px rgba(0, 243, 255, 0.25);">\n            <span>🔬</span> MULTIMODAL HUB\n          </button>\n          `;
  html = html.replace(btnTrainingHubMarker, hubButton + btnTrainingHubMarker);
  console.log("✅ Injected Header Button.");
}

// 2. Add button in mobile control sheet
const sheetToolMarker = '<button type="button" class="sheet-tool-btn highlight" onclick="openTrainingHub();';
if (!html.includes('openMultimodalHub(); closeMobileControlSheet();')) {
  const mobileSheetBtn = `<button type="button" class="sheet-tool-btn highlight" onclick="openMultimodalHub(); closeMobileControlSheet();" style="border-color: #00f3ff !important;">\n          <span class="tool-icon">🔬</span>\n          <div class="tool-info">\n            <strong>MULTIMODAL HUB</strong>\n            <small>Video rPPG, Lab OCR, ECG &amp; SLM</small>\n          </div>\n        </button>\n\n        `;
  html = html.replace(sheetToolMarker, mobileSheetBtn + sheetToolMarker);
  console.log("✅ Injected Mobile Drawer Button.");
}

// 3. Add Modal HTML markup before Hybrid Search Modal
const searchModalMarker = '<!-- ===== HYBRID MEDICAL SEARCH MODAL (BM25 + DENSE) ===== -->';
if (!html.includes('id="multimodalHubModal"')) {
  const modalMarkup = `<!-- ===== MULTIMODAL DIAGNOSTICS & CONTINUOUS SLM MODAL ===== -->
  <div class="session-panel-backdrop" id="multimodalHubBackdrop" onclick="closeMultimodalHub()" style="display:none; z-index:10000;"></div>
  <div class="tutorial-modal" id="multimodalHubModal" style="display:none; max-width:880px; width:94%; z-index:10001; border:2px solid #00f3ff; box-shadow:0 0 35px rgba(0, 243, 255, 0.3); background:#0c1222;">
    <div class="tut-header" style="border-bottom:1px solid rgba(0, 243, 255, 0.25); padding-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
      <span style="color:#00f3ff; font-family:var(--font-head); font-weight:bold; font-size:1.15rem; display:flex; align-items:center; gap:8px;">
        <span>🔬</span> MULTIMODAL DIAGNOSTICS &amp; CONTINUOUS SLM ENGINE
      </span>
      <button class="sp-close" onclick="closeMultimodalHub()" style="color:#00f3ff; font-weight:bold; background:none; border:none; cursor:pointer; font-size:1.25rem;">✕</button>
    </div>

    <!-- Navigation Tabs -->
    <div style="display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding:10px 0; overflow-x:auto;">
      <button type="button" class="mm-tab-btn active" data-tab="rppg" onclick="window.ramanMultimodalHubUI.switchTab('rppg')" style="padding:6px 14px; border-radius:6px; font-size:0.75rem; font-family:var(--font-head); font-weight:bold; cursor:pointer; border:1px solid #00f3ff; color:#00f3ff; background:rgba(0,243,255,0.12); white-space:nowrap;">🎥 VIDEO rPPG TELEMETRY</button>
      <button type="button" class="mm-tab-btn" data-tab="paper" onclick="window.ramanMultimodalHubUI.switchTab('paper')" style="padding:6px 14px; border-radius:6px; font-size:0.75rem; font-family:var(--font-head); font-weight:bold; cursor:pointer; border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); background:transparent; white-space:nowrap;">📄 PAPER LAB &amp; ECG DIGITIZER</button>
      <button type="button" class="mm-tab-btn" data-tab="fusion" onclick="window.ramanMultimodalHubUI.switchTab('fusion')" style="padding:6px 14px; border-radius:6px; font-size:0.75rem; font-family:var(--font-head); font-weight:bold; cursor:pointer; border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); background:transparent; white-space:nowrap;">🩺 MULTIMODAL FUSION &amp; CONFORMAL SET</button>
      <button type="button" class="mm-tab-btn" data-tab="slm" onclick="window.ramanMultimodalHubUI.switchTab('slm')" style="padding:6px 14px; border-radius:6px; font-size:0.75rem; font-family:var(--font-head); font-weight:bold; cursor:pointer; border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); background:transparent; white-space:nowrap;">🧬 CONTINUOUS SLM FLYWHEEL</button>
    </div>

    <div class="tut-body" style="padding:15px 0; max-height:68vh; overflow-y:auto;">
      <!-- PANE 1: VIDEO rPPG -->
      <div id="mmPane_rppg" class="mm-tab-pane" style="display:block;">
        <div style="display:flex; gap:15px; flex-wrap:wrap;">
          <div style="flex:1; min-width:300px;">
            <div style="background:#070c18; border:1px solid rgba(0,243,255,0.2); border-radius:8px; padding:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.75rem; color:var(--cyan); font-family:var(--font-head); font-weight:bold;">CHROMINANCE PULSE WAVE (BVP)</span>
                <span style="font-size:0.68rem; color:var(--text-muted);">0.7 Hz – 3.5 Hz BANDPASS</span>
              </div>
              <canvas id="rppgCanvas" width="440" height="130" style="width:100%; height:130px; display:block; border-radius:4px;"></canvas>
            </div>
            <div style="margin-top:10px; display:flex; gap:10px;">
              <button id="btnToggleRppg" onclick="window.ramanMultimodalHubUI.toggleRppgCamera()" style="background:rgba(0,243,255,0.15); border:1px solid var(--cyan); color:var(--cyan); padding:8px 16px; border-radius:6px; font-size:0.78rem; font-family:var(--font-head); font-weight:bold; cursor:pointer;">▶ Start Optical Sensing</button>
            </div>
          </div>
          <div style="flex:1; min-width:280px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px;">
              <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Heart Rate</span>
              <div id="rppgHr" style="font-size:1.4rem; font-weight:bold; color:var(--cyan); font-family:var(--font-head);">-- BPM</div>
              <small style="font-size:0.65rem; color:var(--text-muted);">Chrominance derived</small>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px;">
              <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">HRV (SDNN)</span>
              <div id="rppgHrv" style="font-size:1.4rem; font-weight:bold; color:var(--teal); font-family:var(--font-head);">-- ms</div>
              <small style="font-size:0.65rem; color:var(--text-muted);">Pulse rate variability</small>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px;">
              <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Respiration Rate</span>
              <div id="rppgResp" style="font-size:1.4rem; font-weight:bold; color:#ffb400; font-family:var(--font-head);">-- bpm</div>
              <small style="font-size:0.65rem; color:var(--text-muted);">Low frequency BVP wave</small>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px;">
              <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Optical Quality</span>
              <div id="rppgConf" style="font-size:1.4rem; font-weight:bold; color:var(--teal); font-family:var(--font-head);">-- %</div>
              <small style="font-size:0.65rem; color:var(--text-muted);">SNR stability index</small>
            </div>
          </div>
        </div>
      </div>

      <!-- PANE 2: PAPER LAB & ECG DIGITIZER -->
      <div id="mmPane_paper" class="mm-tab-pane" style="display:none;">
        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
          <button type="button" onclick="window.ramanMultimodalHubUI.loadSample('stemi_lab')" style="background:rgba(255,42,109,0.15); border:1px solid var(--red-warn); color:var(--red-warn); padding:6px 12px; border-radius:6px; font-size:0.75rem; font-weight:bold; cursor:pointer;">🚨 Load Cardiac STEMI + Lab Panel</button>
          <button type="button" onclick="window.ramanMultimodalHubUI.loadSample('melanoma')" style="background:rgba(255,180,0,0.15); border:1px solid #ffb400; color:#ffb400; padding:6px 12px; border-radius:6px; font-size:0.75rem; font-weight:bold; cursor:pointer;">🩹 Load Suspicious Dermal ABCD</button>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Lab OCR Section -->
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px;">
            <div style="font-weight:bold; color:var(--cyan); font-size:0.78rem; margin-bottom:6px;">📄 PAPER LAB TEST OCR PARSER</div>
            <textarea id="mmLabInput" rows="3" style="width:100%; background:#070a14; border:1px solid var(--border); border-radius:6px; color:var(--text-main); font-size:0.75rem; padding:6px; font-family:monospace;" placeholder="Paste raw OCR extracted text from lab report..."></textarea>
            <button onclick="window.ramanMultimodalHubUI.parseLabText()" style="margin-top:6px; background:rgba(0,243,255,0.15); border:1px solid var(--cyan); color:var(--cyan); padding:5px 12px; border-radius:4px; font-size:0.72rem; cursor:pointer; font-weight:bold;">Parse Lab &amp; LOINC</button>
            <div id="mmLabOutput" style="margin-top:8px;"></div>
          </div>

          <!-- ECG Section -->
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px;">
            <div style="font-weight:bold; color:var(--cyan); font-size:0.78rem; margin-bottom:6px;">📈 12-LEAD PAPER ECG DIGITIZER</div>
            <p style="font-size:0.72rem; color:var(--text-muted); margin:0 0 8px 0;">Vectorizes paper traces into 1D voltage-time functions, measuring PR, QRS, and QTc intervals.</p>
            <button onclick="window.ramanMultimodalHubUI.digitizeEcg()" style="background:rgba(0,243,255,0.15); border:1px solid var(--cyan); color:var(--cyan); padding:5px 12px; border-radius:4px; font-size:0.72rem; cursor:pointer; font-weight:bold;">Digitize ECG Strip</button>
            <div id="mmEcgOutput" style="margin-top:8px;"></div>

            <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
              <div style="font-weight:bold; color:var(--cyan); font-size:0.78rem; margin-bottom:4px;">🔬 CALIBRATED DERMAL ABCD ANALYZER</div>
              <button onclick="window.ramanMultimodalHubUI.runDermalAnalysis()" style="background:rgba(0,243,255,0.15); border:1px solid var(--cyan); color:var(--cyan); padding:5px 12px; border-radius:4px; font-size:0.72rem; cursor:pointer; font-weight:bold;">Run Optical ABCD</button>
              <div id="mmDermalOutput" style="margin-top:6px;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- PANE 3: MULTIMODAL FUSION & CONFORMAL SET -->
      <div id="mmPane_fusion" class="mm-tab-pane" style="display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h4 style="margin:0; color:var(--cyan); font-family:var(--font-head); font-size:0.95rem;">CROSS-MODAL REASONING &amp; CONFORMAL PREDICTION</h4>
            <small style="color:var(--text-muted);">Synthesizes video, ECG, lab, and dermal streams into 99% guaranteed confidence sets.</small>
          </div>
          <button onclick="window.ramanMultimodalHubUI.runMultimodalSynthesis()" style="background:var(--accent); border:none; color:#0f172a; padding:8px 16px; border-radius:6px; font-weight:bold; font-size:0.78rem; font-family:var(--font-head); cursor:pointer;">⚡ Synthesize Differential</button>
        </div>
        <div id="mmSynthesisOutput" style="background:#070c18; border:1px solid rgba(0,243,255,0.2); border-radius:8px; padding:15px;">
          <div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:20px;">
            Click <strong>"Synthesize Differential"</strong> or load sample cases from the Paper &amp; Ingestion tab to compute cross-modal reasoning.
          </div>
        </div>
      </div>

      <!-- PANE 4: CONTINUOUS SLM FLYWHEEL -->
      <div id="mmPane_slm" class="mm-tab-pane" style="display:none;">
        <div style="background:rgba(0, 255, 179, 0.05); border:1px solid rgba(0, 255, 179, 0.2); border-radius:8px; padding:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:0.68rem; color:var(--teal); text-transform:uppercase; font-weight:bold;">Active Small Language Model</span>
            <div id="slmVersionDisplay" style="font-size:1.15rem; font-weight:bold; color:#fff; font-family:var(--font-head);">SLM-Adapter-v1.0.0</div>
            <small style="color:var(--text-muted); font-size:0.7rem;">LoRA INT4 Quantized Edge Model (EWC Regularized)</small>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">Ingestion Queue</span>
            <div id="slmQueueDisplay" style="font-size:1.15rem; font-weight:bold; color:var(--cyan); font-family:var(--font-head);">0 cases</div>
            <small style="color:var(--text-muted); font-size:0.7rem;">Auto-retrain threshold: 5 cases</small>
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <button onclick="window.ramanMultimodalHubUI.simulateClinicianSignOff()" style="background:rgba(0,243,255,0.18); border:1px solid var(--cyan); color:var(--cyan); padding:9px 18px; border-radius:6px; font-weight:bold; font-size:0.8rem; font-family:var(--font-head); cursor:pointer;">
            🔄 Simulate Clinician Sign-Off &amp; Execute Retraining Sweep
          </button>
        </div>

        <div id="slmSweepLog" style="background:#070c18; border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:12px; font-size:0.75rem; color:var(--text-main); line-height:1.6;">
          <span style="color:var(--text-muted);">Ready to ingest verified clinical encounters into continuous auto-training loop.</span>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
      <button onclick="closeMultimodalHub()" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); padding:6px 16px; border-radius:4px; font-size:0.75rem; font-family:var(--font-head); cursor:pointer;">Close</button>
    </div>
  </div>\n\n  `;
  html = html.replace(searchModalMarker, modalMarkup + searchModalMarker);
  console.log("✅ Injected Multimodal Hub Modal Markup.");
}

// 4. Add Script tags before app.js
const appJsScriptMarker = '<script defer src="app.js?v=2.1"></script>';
if (!html.includes('multimodal_diagnostic_engine.js')) {
  const scriptsToInject = `<script defer src="multimodal_diagnostic_engine.js?v=1.0"></script>\n  <script defer src="continuous_slm_trainer.js?v=1.0"></script>\n  <script defer src="multimodal_hub_ui.js?v=1.0"></script>\n  `;
  html = html.replace(appJsScriptMarker, scriptsToInject + appJsScriptMarker);
  console.log("✅ Injected Script Tags.");
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log("🌟 index.html successfully updated with Multimodal UI components!");
