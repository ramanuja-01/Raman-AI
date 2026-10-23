# 📜 RAMAN AI – Changelog & Versioning History
### *Experiment No. 170: Offline Client-Side Diagnostic Sandbox*

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] – Strategic Upgradation Roadmap

### Planned for [3.0.0] – Q3–Q4 2027 (Physiological Twin & Edge Vision)
#### Added
* **3D Volumetric Organ Raymarching:** WebGPU WGSL shader rendering real-time 3D contracting cardiac chambers and lung parenchyma inflation driven by live bio-telemetry.
* **Multi-Organ Pharmacokinetic (PK/PD) Compute Shaders:** Parallel 4th-order Runge-Kutta differential solvers computing real-time drug absorption and elimination curves across hepatic and renal pathways.
* **Offline Computer Vision for Visual Diagnostics:** Lightweight local ONNX WASM vision models (MobileNetV3) analyzing skin lesions, ocular redness, and lateral-flow test strips from camera video feeds.
* **Federated Active Learning:** Offline Peer-to-Peer gradient synchronization with differential privacy noise ($\epsilon, \delta$-DP) over local WebRTC channels.

---

## [2.2.0] – 2026-10-23 (Federated Active Learning, Quantized SLM SOAP Engine & PWA Cache)

### Added
* **Federated Active Learning Engine (`federated_learning.js`):**
  * Offline $(\epsilon, \delta)$-Differential Privacy with calibrated Gaussian noise injection and $L_2$ gradient sensitivity clipping on clinician active learning updates.
  * Multi-client Federated Averaging (FedAvg) algorithm combining distributed weight deltas across local clinical nodes.
  * Privacy-preserving gradient serialization packages maintaining zero exposure of raw training phrases or patient records.
* **Offline Quantized Small Language Model (SLM) Reasoning Engine (`quantized_slm.js`):**
  * 4-bit / 2-bit integer quantized weight representation (Q4_0, Q2_K) with SIMD128 lookup tables.
  * Structured Clinical Narrative (SOAP Note) generator producing Subjective, Objective, Assessment, and Plan rationale offline.
* **PWA Service Worker Cache Sync (`sw.js`):**
  * Upgraded cache namespace to `raman-ai-v2.5` pre-caching all newly created modular scripts (`mcp_agent_worker.js`, `ble_telemetry.js`, `fhir_exporter.js`, `zkp_verifier.js`, `webgpu_volumetric.js`, `webgpu_pkpd.js`, `hybrid_search.js`, `vision_diagnostics.js`, `federated_learning.js`, `quantized_slm.js`) for 100% offline cold boots.
* **Test Suites Expanded:**
  * Added Test Suites 31 (Federated Learning & DP) and 32 (Quantized SLM SOAP Engine) to `test_slm.js` (32/32 unit suites passing).
  * Added automated Playwright E2E suite: `tests/federated_quantized.spec.js` (3/3 passing).

---

## [2.1.0] – 2026-10-23 (3D Volumetric Raymarching, PK/PD Dynamics, Hybrid Search & Computer Vision)

### Added
* **3D Volumetric Raymarching & Anatomical Simulation Engine (`webgpu_volumetric.js`):**
  * Real-time WebGPU WGSL signed distance function (SDF) sphere-tracing raymarcher for 4-chamber cardiac systolic/diastolic pulsing ($d_{\text{chamber}}(\mathbf{p}, t)$) driven by live patient heart rate ($\omega = 2\pi \cdot (\text{BPM} / 60)$) and bilateral pulmonary lung lobe inflation driven by respiration rate and SpO2.
  * High-performance CPU/Canvas2D procedural volumetric slice projection fallback for 100% offline deterministic execution.
  * Interactive HUD simulation mode switcher: `[📊 2D Scatter | 🫀 3D Organ | 💊 PK/PD]`.
* **Parallel Pharmacokinetic & Pharmacodynamic (PK/PD) Modeling Engine (`webgpu_pkpd.js`):**
  * 2-compartment open pharmacokinetic ODE solver implemented via 4th-order Runge-Kutta (RK4) integration simulating GI absorption ($C_g$), central vascular distribution ($C_c$), and peripheral tissue clearance ($C_p$) over 24 hours.
  * Parallel WebGPU compute shader simulating 1,024 patient metabolic cohorts adjusted for age and eGFR renal clearance.
  * Real-time interactive canvas curve renderer plotting plasma concentration profiles against therapeutic windows (MEC, MTC, Cmax, Tmax).
* **Offline BM25 + Dense Vector Hybrid Search Engine (`hybrid_search.js`):**
  * Sub-10ms offline clinical retrieval combining BM25 Okapi lexical inverted index ($k_1 = 1.2, b = 0.75$) with 64-dimensional dense semantic vector cosine similarity.
  * Reciprocal Rank Fusion (RRF) merging lexical and dense rankings for instant pharmacopeia, SNOMED CT, and drug contraindication discovery.
  * Interactive search modal dialog with live category badges and snippet previews.
* **Offline Computer Vision Diagnostic Analyzer (`vision_diagnostics.js`):**
  * Client-side edge visual diagnostics for webcam frames:
    1. Ocular hyperemia and conjunctival injection staging via Erythema Index and scleral mask segmentation.
    2. Dermatological pigmented lesion evaluation using clinical ABCD criteria (Asymmetry, Border irregularity, Color variegation, Diameter ratio).
    3. Rapid lateral-flow diagnostic test strip reader detecting Control ('C') and Test ('T') bands via vertical luminance valley profiling.
  * Canvas HUD reticle and triage result banner overlay.
* **Test Suites Expanded:**
  * Added Test Suites 27 (3D Volumetric SDFs), 28 (PK/PD RK4 Solver), 29 (BM25 + Dense Hybrid Search), 30 (Computer Vision Diagnostics) to `test_slm.js` (30/30 passing unit suites).
  * Added automated Playwright E2E suite: `tests/webgpu_search_vision.spec.js` (4/4 passing).

---

## [2.0.0] – 2026-10-23 (WASM Intelligence & Clinical Interoperability)

### Added
* **Dedicated Web Worker Multi-Agent MCP Hub (`mcp_agent_worker.js`):**
  * Decoupled Symptom Ingestion, Pharmacotherapy Compiler, Vocabulary Training, and Self-Healing engines into an isolated background `WebWorker` thread.
  * Standardized JSON-RPC 2.0 communication (`mcp/ingestAndRetrain`, `mcp/selfHealingScan`) with zero-copy `TransferableObjects` (`ArrayBuffer` weight transfer).
  * Maintained sub-millisecond processing latency without locking the main browser UI or requestAnimationFrame loop.
* **Dynamic MLP Neural Scaling & Model Expansion (`expandModelCapacity`):**
  * Implemented dynamic layer resizing up to 64 hidden units and on-the-fly output condition expansion (e.g. 17 baseline $\to$ 35+ classes).
  * Preserved pre-trained connection weights using contiguous `Float32Array` slice reallocations.
* **Offline ONNX Runtime Web WASM Cross-Encoder Reranker (`RamanOnnxReranker`):**
  * Integrated offline ONNX Runtime Web fallback engine with subword vocabulary dot-product scoring and zero-cloud fallback.
* **Native Web Bluetooth (BLE) Telemetry Engine (`ble_telemetry.js`):**
  * Implemented Bluetooth SIG standard GATT profiles for Heart Rate Service (`0x180D`/`0x2A37`) and Pulse Oximeter Service (`0x1822`/`0x2A5F`).
  * Supports 8-bit/16-bit HR parsing, SFLOAT SpO2 format, exponential backoff reconnection state machine, and real-time DOM synchronization.
* **HL7 FHIR Release 4 (R4) Document Bundle Exporter (`fhir_exporter.js`):**
  * Structured export of offline consultation logs into valid FHIR JSON document bundles (`Bundle`, `Patient`, `Condition` with ICD-11, `Observation` with LOINC `8867-4`/`2708-6`/`85354-9`, `MedicationStatement` with SNOMED CT).
* **Client-Side Zero-Knowledge Proof (ZKP) Health Circuit (`zkp_verifier.js`):**
  * Client-side Groth16 cryptographic proof generation for selective disclosure (`ALLERGY_ABSENCE`, `VITAL_STABILITY`, `STAGE1_LOW_RISK`).
  * Enables mathematical attestation of medical safety criteria to third parties without disclosing patient identity, full diagnosis, or raw PHI.
  * Interactive UI modal with attestation selector and in-browser mathematical verification.
* **Test Suites Expanded:**
  * Added Test Suites 21, 22, 23 (Milestone 1) and 24, 25, 26 (Milestone 2) to `test_slm.js` (26/26 passing unit suites).
  * Added automated Playwright E2E suites: `tests/mcp_worker.spec.js` and `tests/ble_fhir_zkp.spec.js`.

---

## [1.0.0] – 2026-10-21 (Production Baseline)

### Added
* **Responsive Mobile-First PWA:**
  * Dynamic `100dvh` viewport scaling with iOS notch and home-indicator protection (`env(safe-area-inset-*)`).
  * 4-tab mobile bottom navigation (`Consult`, `Vitals`, `Diary`, `Records`) for viewports $\le 900\text{px}$.
  * Horizontal touch-scrollable organ chips carousel and quick symptoms scroller.
  * Cache-First Service Worker (`sw.js`) and Web App Manifest (`manifest.json`) for 100% offline cold boots.
* **Automated End-to-End Test Suite:**
  * Zero-dependency local Playwright test harness (`playwright.config.js`).
  * Cross-platform verification across Desktop Chromium, Mobile Android (Pixel 7), and Mobile iOS (iPhone 14 emulation).
* **Deep 4-Layer Multi-Layer Perceptron (MLP):**
  * Topology: Input $\to$ H1 (32 units, ReLU) $\to$ H2 (16 units, ReLU) $\to$ H3 (8 units, ReLU) $\to$ Output (27 conditions, Softmax).
  * Seeded Xavier/Glorot deterministic initialization via Linear Congruential Generator (LCG).
  * Sparse backpropagation skipping zero-valued input features.
* **Subword Character N-Gram Tokenizer:**
  * Character 3-grams (`c3:`) and 4-grams (`c4:`) for words $\ge 4$ characters for robust typo tolerance.
* **Pharmacogenomic (PGx) Safety Engine:**
  * Intercepts Nitrofurantoin in G6PD deficiency, Abacavir in HLA-B*5701, and Codeine in CYP2D6 Poor Metabolizers.
* **Clinician Active Learning Feedback Portal:**
  * Interactive override dialog computing gradient deltas persisted in `localStorage` as `localClinicianDeltas`.
* **Parallel Web Worker CPU Simulation Fallback:**
  * Offloads 16,384 vital trajectory simulations to dynamic `Blob` Web Workers.
* **Bilingual Hindi & Odia Integration:**
  * Romanized Hindi/Odia and Devanagari suffix-stripping rules and regional TTS voice routing.

---

## [0.9.0] – 2026-07-15

### Added
* **Simulated MCP Multi-Agent Ingestion Hub:**
  * Ingestion, Pharmacotherapy Compiler, and Training Agents with real-time JSON-RPC 2.0 telemetry.
  * 7 clinical datasets (`otitis`, `cardio`, `respiratory`, `neuro`, `gastro`, `dental`, `ophthalmology`).
* **WebGPU WGSL Compute Triage Shader:**
  * Hardware-accelerated 1,024-trajectory physiological simulation with demographic/heat index buffers.
* **Dynamic Markov Softmax Temperature Control:**
  * Slider-adjustable dialogue creativity ($T = 0.1 \to 2.0$) for empathetic natural language synthesis.
* **Real-time Canvas ECG Oscilloscope:**
  * Dynamic P-Q-R-S-T wave rendering matching simulated heart rate.

---

## [0.8.0] – 2026-05-25

### Added
* **Quad-Model Ensemble Core:**
  * One-vs-Rest Linear SVM + Multinomial Naive Bayes + Fuzzy Trie sliding-window matcher.
* **AES-256-GCM Binary Health Vault:**
  * PBKDF2 100,000 iterations, 16-byte salt, 12-byte IV for IndexedDB image and consultation backup.
* **Bio-Telemetry Web Audio SFX:**
  * 7 procedural waveforms (laser sweep, telemetry click, triple warning alarm, slide, success, error, tick).
* **Clinical Safety Substitutions:**
  * Automated NSAID, Penicillin, and Sulfa allergy interception.
* **Print-Ready A4 PDF Prescription Engine:**
  * Clinical layout with tabular Rx, signatures, and stamps.