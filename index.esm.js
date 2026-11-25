/**
 * RAMAN AI (Experiment No. 170) – ES Module Entry Point
 * Air-gapped, zero-cloud offline clinical medical intelligence.
 * @module raman_ai
 */

export { RamanVolumetricRenderer } from './webgpu_volumetric.js';
export { RamanPkPdSimulator, DRUG_PK_PROFILES } from './webgpu_pkpd.js';
export { RamanVcgEngine, ramanVcgEngine, VCG_CONFIG } from './vcg_vectorcardiography.js';
export { RamanHybridSearchEngine, createDefaultMedicalCorpus } from './hybrid_search.js';
export { RamanVisionDiagnostics } from './vision_diagnostics.js';
export {
  RamanBleManager,
  parseHeartRateMeasurement,
  parsePulseOximeterMeasurement,
  parseXiaomiSteps,
  parseXiaomiBattery,
  parseXiaomiSpO2,
  calculateHrvMetrics,
  analyzeCardiacRhythm,
  isXiaomiBrand,
  parseSFloat,
  XIAOMI_UUIDS,
  XIAOMI_COMMANDS
} from './ble_telemetry.js';
export {
  generateFhirR4Bundle,
  downloadFhirR4Json,
  generateMultimodalFhirDiagnosticReport,
  downloadMultimodalFhirJson
} from './fhir_exporter.js';
export { RamanZkpProver, openZkpModal, executeZkpGeneration } from './zkp_verifier.js';
export { RamanSignatureEngine, ramanSignatureEngine } from './digital_signature.js';
export { RamanSpeechEngine, ramanSpeechEngine, PHONETIC_MEDICAL_REPLACEMENTS } from './stt_dictation.js';
export { RamanFederatedLearning } from './federated_learning.js';
export { RamanQuantizedSlm } from './quantized_slm.js';
export { RamanUiAgent } from './ui_responsive_agent.js';
export { RamanMultimodalEngine } from './multimodal_diagnostic_engine.js';
export { RamanContinuousSlmTrainer } from './continuous_slm_trainer.js';
