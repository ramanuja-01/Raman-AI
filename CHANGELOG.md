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

## [2.6.0] – 2026-11-05 (Tropical Disease Expansion, Web Crypto Signatures, Multilingual STT & 4-Chamber WebGPU Anatomy)

### Added
* **Expanded Tropical & Acute Disease Knowledge Base (WHO ICD-11 & SNOMED CT):**
  * **Dengue Fever (ICD-11 `1D20.0`):** Added comprehensive clinical profile, retro-orbital pain, petechiae, thrombocytopenia breakbone symptoms, and strict contraindication blocking NSAIDs (Aspirin, Ibuprofen, Diclofenac) to prevent fatal hemorrhagic shock, substituting with Paracetamol only.
  * **Typhoid Fever (ICD-11 `1A07.0`):** Enteric fever profile, step-ladder fever, relative bradycardia (Faget's sign), coated tongue, and Salmonella typhi bacteremia therapy (Azithromycin, Cefixime).
  * **Malaria (ICD-11 `1F40`):** Plasmodium falciparum / vivax paroxysm triage, drenching sweats, rigors, artemisinin combination therapy (ACT), and mandatory G6PD deficiency screening before Primaquine to eliminate acute hemolytic anemia.
  * **Acute Gastroenteritis (ICD-11 `1A40.0`):** Hypovolemic dehydration scoring, oral rehydration therapy (WHO ORS), and peripheral enkephalinase inhibitor (Racecadotril).
  * **Chikungunya (ICD-11 `1D21.0`):** Crippling bilateral polyarthralgia and post-arboviral inflammatory care.
  * **Scrub Typhus (ICD-11 `1C30.1`):** Orientia tsutsugamushi mite-borne infection with pathognomonic necrotic eschar lesion triage and Doxycycline 100mg first-line therapy.
* **Web Crypto Asymmetric Digital Signatures (`digital_signature.js`):**
  * Client-side ECDSA P-256 with SHA-256 keypair generation via native `SubtleCrypto`.
  * Generates tamper-evident digital signatures for SMART Health Cards, FHIR IPS bundles, and A4 Prescriptions with sub-millisecond verification.
  * Interactive cryptographic verification badge displayed inside `#digitalHealthCardModal` with one-click in-browser validation, live SHA-256 digest calculation, and latency auditing.
* **Tropical Disease Organ Chips & Quick Symptoms Carousel (`index.html`):**
  * Added touch-optimized organ chips for Dengue (`🦟 Dengue / ଡେଙ୍ଗୁ`), Malaria (`🩸 Malaria / ମ୍ୟାଲେରିଆ`), Typhoid (`🌡️ Typhoid / ଟାଇଫଏଡ୍`), and Diarrhea (`💧 Diarrhea / ଝାଡ଼ାବାନ୍ତି`) in `#anatomicalChipsCarousel`.
  * Added quick symptom shortcuts across sidebar and mobile scroller (`#quickSymptomsScroller`).
* **Multilingual Speech-to-Text (STT) Dictation Engine (`stt_dictation.js`):**
  * In-browser voice dictation supporting English (`en-IN`), Hindi (`hi-IN`), and Odia (`or-IN`).
  * Real-time phonetic clinical normalizer autocorrecting colloquial symptoms and dialect speech to medical terminology.
  * Web Audio API `AnalyserNode` microphone volume visualizer driving dynamic waveform pulsing.
* **Advanced 4-Chamber Cardiac & Hepatic Raymarching (`webgpu_volumetric.js`):**
  * Dual-phase atrial and ventricular systolic deformation with phase-shifted contraction.
  * Hepatic liver lobe SDF in the right hypochondrium for hepatomegaly and tropical infection visualization.
* **Multi-Drug eGFR-Adjusted Pharmacokinetics (`webgpu_pkpd.js`):**
  * Added pharmacokinetic profiles for `ciprofloxacin`, `azithromycin`, `artemisinin`, and `doxycycline`.
  * Dynamic renal elimination scaling factoring in patient eGFR.
* **PWA Cache Sync (`sw.js`):**
  * Bumped cache namespace to `raman-ai-v2.9` and registered `digital_signature.js` and `stt_dictation.js` in `STATIC_ASSETS`.
* **Automated Unit & E2E Tests Expanded (`test_slm.js`, `tests/tropical_signature_stt.spec.js`):**
  * Added Test Suites 40, 41, 42, 43 to `test_slm.js`. Total 43/43 suites passing with 0 failures at sub-millisecond speeds.
  * Added Playwright E2E suite `tests/tropical_signature_stt.spec.js` covering Web Crypto P-256 verification, STT normalization, Dengue triage, and organ chip interactions.

---

## [2.5.0] – 2026-11-04 (Offline SMART Health Card QR Matrix & Real-Time Arrhythmia Analysis)

### Added
* **Offline Client-Side QR Code & SMART Health Card Matrix Engine (`qr_code.js`):**
  * **ISO/IEC 18004:2015 Compliant QR Matrix Generator:** Pure-mathematics Galois Field $GF(2^8)$ (primitive polynomial $0x11D = 285$) and Reed-Solomon Error Correction Code generation across Versions 1–10 and Error Correction levels L and M. Runs 100% offline in browser memory in $<0.5\text{ ms}$ with zero cloud dependencies.
  * **Scalable Vector SVG & Data URI Formatter:** Generates crisp, resolution-independent vector SVG QR codes with configurable module quiet zones, colors, and viewBox coordinates for immediate DOM and printable document rendering.
  * **SMART Health Card & FHIR IPS Tamper-Evident Payload:** Encodes a compact JSON payload containing Patient Health ID, ICD-11 diagnosis, calculated physiological scores (NEWS2, qSOFA, Shock Index, eGFR), CPIC clearance flag, and Groth16 ZKP proof digest (`pi_a`).
  * **A4 Print Layout QR Integration (`downloadPrescriptionPDF` in `app.js`):** Embeds an offline-verifiable SMART Health QR code directly onto the printed A4 consultation prescription for instant scanning by paramedics, referral doctors, or triage officers.
  * **Interactive Digital Health Card Modal (`#digitalHealthCardModal` & `window.openDigitalHealthCardModal` in `app.js`):** Full-screen glassmorphic dialog with live vector QR code, one-click payload clipboard export, and detailed triage score breakdown.
* **Real-Time Cardiac Rhythm & Arrhythmia Triage (`calculateHrvMetrics` & `analyzeCardiacRhythm` in `ble_telemetry.js`):**
  * **ESC/NASPE & Pan-Tompkins Clinical Rhythm Classification:** Real-time processing of continuous Bluetooth (BLE) optical PPG / ECG R-R intervals to classify cardiac rhythms into `NORMAL_SINUS_RHYTHM`, `SINUS_BRADYCARDIA` ($HR < 60\text{ bpm}$), `SINUS_TACHYCARDIA` ($HR > 100\text{ bpm}$), `POSSIBLE_ATRIAL_FIBRILLATION` (chaotic R-R intervals with coefficient of variation $CV_{RR} \ge 0.12$), and `INCREASED_ECTOPIC_BURDEN` ($0.10 \le CV_{RR} < 0.12$).
  * **Autonomic Heart Rate Variability (HRV) Metrics:** Computes $RMSSD$, $SDNN$, $pNN50$, and Baevsky's Stress Index ($SI$) for objective non-invasive autonomic stress assessment.
* **PWA Service Worker Cache Sync (`sw.js`):**
  * Upgraded cache namespace to `raman-ai-v2.8` and registered `./qr_code.js` in `STATIC_ASSETS` for instantaneous offline caching.
* **Automated Test Suites Expanded (`test_slm.js`):**
  * Added Test Suite 39 (Offline QR Health Card Matrix & Real-Time Arrhythmia Analysis).
  * 39/39 automated test suites passing with 0 failures at sub-millisecond execution speeds.

---

## [2.4.0] – 2026-11-04 (Evidence-Based Clinical Scoring, CPIC PGx, HL7 FHIR IPS & Grounded SLM)

### Added
* **Standardized Physiological Deterioration Triage Engine (`calculateClinicalScores` in `app.js`):**
  * **NEWS2 (National Early Warning Score 2 - Royal College of Physicians 2017):** Real-time aggregation of respiration rate, SpO2, systolic BP, pulse rate, alertness (ACVPU), and core temperature into validated clinical risk tiers (Low, Medium with Red Score alerts, High critical escalation).
  * **qSOFA (Quick Sepsis-related Organ Failure Assessment - Sepsis-3, JAMA 2016):** Real-time bedside sepsis screening evaluating hypotension ($\le 100\text{ mmHg}$), tachypnea ($\ge 22\text{ bpm}$), and altered consciousness.
  * **Shock Index (SI = HR / SBP - Allgöwer & Burri / Rady et al.):** Instant detection of occult hypoperfusion and left ventricular strain ($\text{SI} > 0.9$).
  * **Cockcroft-Gault Creatinine Clearance & eGFR Staging:** Dynamic renal clearance formula ($eGFR / CrCl$) factoring in patient age, body weight, serum creatinine, and biological sex.
* **CPIC Pharmacogenomic & Renal Titration Safety Engine (`checkSafetyContraindications` in `app.js`):**
  * **Severe Renal Impairment ($eGFR < 30\text{ mL/min}$):** Blocks Metformin due to lactic acidosis risk (substituting with renal-safe *Linagliptin 5mg*, SNOMED `429503001`) and applies a 50% renal dose reduction to Ciprofloxacin (*Ciprofloxacin 250mg*, SNOMED `387532007`).
  * **CPIC Level A Guidelines:**
    * *CYP2C19 Poor Metabolizer:* Blocks Clopidogrel due to loss of bioactivation and substitutes with *Ticagrelor 90mg* (SNOMED `444901007`).
    * *CYP2D6 Ultrarapid Metabolizer:* Blocks Codeine/Tramadol due to fatal morphine intoxication risk and substitutes with *Paracetamol 650mg + Ibuprofen 400mg* (SNOMED `387584000`).
    * *SLCO1B1 Decreased Function:* Blocks Atorvastatin/Simvastatin due to rhabdomyolysis and severe myotoxicity risks and substitutes with *Rosuvastatin Calcium 5mg* (SNOMED `407543004`).
    * *HLA-B\*5701 Positive:* Blocks Abacavir due to fatal multi-organ hypersensitivity risk and substitutes with *Tenofovir Disoproxil Fumarate 300mg* (SNOMED `414777006`).
    * *CYP2C9 / VKORC1 Sensitivity:* Blocks Warfarin due to severe bleeding/hemorrhage risk and substitutes with *Apixaban 5mg* (SNOMED `444901007`).
    * *TPMT / NUDT15 Deficiency:* Blocks Azathioprine / 6-Mercaptopurine due to fatal bone marrow suppression and pancytopenia and substitutes with *Methotrexate 15mg* (SNOMED `387494002`).
    * *DPYD Deficiency:* Blocks Fluorouracil / Capecitabine due to fatal neuro/enterotoxicity.
* **Interactive Live Physiological Triage HUD (`#liveTriageHud` in `index.html` & `app.js`):**
  * Real-time cyberpunk glassmorphic sidebar HUD displaying dynamic NEWS2 score, qSOFA sepsis screening, Shock Index, and renal clearance eGFR as vitals are typed or streamed via Bluetooth (BLE) wearables.
  * Formatted clinical risk stratification chip row rendered directly within the post-consultation triage report.
* **HL7 FHIR R4 International Patient Summary (IPS) Expansion (`fhir_exporter.js`):**
  * Serializes structured `AllergyIntolerance` resources mapped to SNOMED CT (`91936005` for Penicillin, `292044008` for NSAIDs, `91939003` for Sulfonamides).
  * Serializes standardized LOINC-coded Clinical Score Observations: NEWS2 Total Score (LOINC `96552-5`), qSOFA Score (LOINC `96790-1`), Shock Index (LOINC `76503-2`), and eGFR (LOINC `33914-3`).
* **Grounded Epistemic Verification for Quantized SLM (`quantized_slm.js`):**
  * Implemented `verifyClinicalGrounding(soapOutput, consultationContext)` checking patient identity, condition diagnosis, WHO ICD-11 codes, telemetry readings, and active pharmacotherapy to eliminate generative medical hallucinations.
* **Zero-Knowledge Proof Deterioration Attestation (`zkp_verifier.js`):**
  * Added `CRITICAL_DETERIORATION_ABSENCE` Groth16 circuit proving absence of physiological deterioration ($\text{NEWS2} \le 4$, $\text{qSOFA} \le 1$, $\text{SI} \le 0.9$) with zero leakage of private vitals or clinical diagnoses.
* **PWA Service Worker Cache Sync (`sw.js`):**
  * Upgraded cache namespace to `raman-ai-v2.7` ensuring 100% offline cold boots with updated engines.
* **Automated Test Suites Expanded (`test_slm.js`):**
  * Added Test Suite 35 (NEWS2, qSOFA, Shock Index & eGFR Verification)
  * Added Test Suite 36 (CPIC Pharmacogenomics & Renal Clearance Dosing Safety)
  * Added Test Suite 37 (HL7 FHIR R4 IPS Document Bundle, ZKP Proofs & Grounded SOAP Verification)
  * Added Test Suite 38 (Live Physiological Triage HUD & Expanded CPIC Guidelines)
  * 38/38 unit test suites passing at sub-millisecond execution speeds.

---

## [2.3.0] – 2026-11-02 (Autonomous Real-Time UI Responsiveness & Self-Healing Agent)

### Added
* **Autonomous Real-Time UI Responsiveness & Self-Healing Engine (`ui_responsive_agent.js`):**
  * Zero-cloud client-side micro-agent categorizing 5 distinct display tiers: `mobile-compact` (< 380px), `mobile` (380–599px), `tablet-portrait` (600–1024px, portrait), `tablet-landscape` (600–1024px, landscape), and `desktop` (> 1024px).
  * Real-time `window.visualViewport` soft-keyboard encroachment compensation computing vertical encroachment height and exposing root CSS property `--v-keyboard-offset` alongside `data-keyboard-open="true"` with automatic input centering.
  * Self-healing horizontal overflow containment detecting document and component-level layout spills (`scrollWidth > winW`) across clinical cards and applying auto-scroll containment styles on the fly.
  * High-DPI Canvas Buffer Synchronization auto-scaling backing store dimensions for clinical monitors and Retina screens without distortion (`data-auto-resync="true"` on `#progressionCanvas`, `#organ3dCanvas`, `#pkpdCanvas`, `#oscilloscopeCanvas`, `#diaryCanvas`).
  * Non-polling, event-driven observer architecture (`ResizeObserver`, `visualViewport.onresize`, `visualViewport.onscroll`, `matchMedia('pointer: coarse')`).
  * Built-in layout thrashing circuit breaker with sliding-window rate limiting (max 5 mutations/sec) and a 60ms dampening lock to prevent runaway reflow loops.
  * Real-time telemetry and diagnostics API via `window.ramanUiAgent.getDiagnostics()` executing steady-state audits in sub-millisecond speeds (< 2.0ms invariant).
* **Comprehensive Specification & Architecture Documentation:**
  * Product Requirements Document (`docs/UI_RESPONSIVENESS_AGENT_PRD.md`)
  * Technical Requirements Document (`docs/UI_RESPONSIVENESS_AGENT_TRD.md`)
  * Formal Software Requirements Specification (`docs/UI_RESPONSIVENESS_AGENT_SRS.md`)
  * Design Guidelines & Non-Negotiable Restrictions (`docs/UI_RESPONSIVENESS_GUIDELINES_AND_RESTRICTIONS.md`)
  * Threat Model & Security Architecture (`docs/UI_RESPONSIVENESS_SECURITY_ARCHITECTURE.md`)
  * Phase-by-Phase Implementation Plan (`docs/UI_RESPONSIVENESS_IMPLEMENTATION_PLAN.md`)
* **PWA Service Worker Cache Sync (`sw.js`):**
  * Upgraded cache namespace to `raman-ai-v2.6` caching `./ui_responsive_agent.js` for 100% offline cold boots.
* **Automated Test Suites:**
  * Added Test Suite 34 to `test_slm.js` covering tier classification, virtual keyboard offset calculations, sub-2ms latency, circuit breaker tripping, and diagnostics (34/34 passing).
  * Added automated Playwright multi-device E2E test suite `tests/ui_responsive_agent.spec.js` running 24 tests across Desktop Chromium, Mobile Android (Pixel 7), and Mobile iOS (iPhone 14) (20 passed, 4 skipped).

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