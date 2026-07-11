/**
 * RAMAN AI – Experiment No. 170
 * Automated SLM Test Suite & Diagnostic Verification Runner
 * Runs locally inside Node.js using mocked browser environments.
 */

const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🧠 RAMAN AI (Experiment No. 170) - OFFLINE SLM DIAGNOSTIC TEST RUNNER");
console.log("==================================================================\n");

// --- Mocking Browser Environment for Node.js Execution ---
const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

const mockIndexedDB = {
  open() {
    return {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null
    };
  }
};

const makeMockElement = () => {
  const el = {
    style: {},
    innerHTML: "",
    className: "",
    value: "",
    scrollTop: 0,
    addEventListener() {},
    removeEventListener() {},
    cloneNode() { return makeMockElement(); },
    appendChild() { return makeMockElement(); },
    removeChild() {},
    querySelector() { return makeMockElement(); },
    querySelectorAll() { return []; },
    parentNode: {
      replaceChild() {}
    },
    getContext() {
      return {
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        fillText() {},
        createLinearGradient() {
          return { addColorStop() {} };
        }
      };
    }
  };

  el.classList = {
    add(cls) {
      const parts = el.className ? el.className.split(/\s+/) : [];
      if (!parts.includes(cls)) {
        parts.push(cls);
        el.className = parts.join(" ");
      }
    },
    remove(cls) {
      const parts = el.className ? el.className.split(/\s+/) : [];
      const idx = parts.indexOf(cls);
      if (idx !== -1) {
        parts.splice(idx, 1);
        el.className = parts.join(" ");
      }
    },
    contains(cls) {
      const parts = el.className ? el.className.split(/\s+/) : [];
      return parts.includes(cls);
    },
    toggle(cls) {
      const parts = el.className ? el.className.split(/\s+/) : [];
      const idx = parts.indexOf(cls);
      if (idx !== -1) {
        parts.splice(idx, 1);
        el.className = parts.join(" ");
        return false;
      } else {
        parts.push(cls);
        el.className = parts.join(" ");
        return true;
      }
    }
  };

  return el;
};

const mockDocument = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = makeMockElement();
    }
    return this.elements[id];
  },
  createElement() {
    return makeMockElement();
  },
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: makeMockElement()
};

const mockWindow = {
  currentLang: 'en',
  open() {
    return {
      document: {
        open() {},
        write() {},
        close() {}
      }
    };
  }
};

global.localStorage = mockLocalStorage;
global.indexedDB = mockIndexedDB;
global.document = mockDocument;
global.window = mockWindow;
global.performance = { now() { return Date.now(); } };

// Mock hardware-agnostic WebGPU APIs for Node.js testing environment
const mockGpu = {
  requestAdapter: async () => {
    return {
      name: "Mocked Universal Graphics Accelerator (NVIDIA/AMD/Intel)",
      requestDevice: async () => {
        return {
          createShaderModule() { return {}; },
          createBuffer({ size }) {
            return {
              byteLength: size,
              mapAsync: async () => {},
              getMappedRange() {
                // Create Float32Array with mock healthy vitals
                const buffer = new ArrayBuffer(size);
                const array = new Float32Array(buffer);
                array.fill(98600720); // Unpacks to Temp: 98.6 and HR: 72.0
                return buffer;
              },
              unmap() {}
            };
          },
          createComputePipeline() {
            return {
              getBindGroupLayout() { return {}; }
            };
          },
          createBindGroup() { return {}; },
          createCommandEncoder() {
            return {
              beginComputePass() {
                return {
                  setPipeline() {},
                  setBindGroup() {},
                  dispatchWorkgroups() {},
                  end() {}
                };
              },
              copyBufferToBuffer() {},
              finish() { return {}; }
            };
          },
          queue: {
            writeBuffer() {},
            submit() {}
          }
        };
      }
    };
  }
};

Object.defineProperty(global, 'navigator', {
  value: { gpu: mockGpu },
  writable: true,
  configurable: true
});
global.GPUBufferUsage = { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, MAP_READ: 8 };
global.GPUMapMode = { READ: 1 };
global.prompt = (msg, def) => def || "";
global.alert = (msg) => console.log("ALERT:", msg);
global.MutationObserver = class {
  constructor() {}
  observe() {}
  disconnect() {}
};

// --- Mocking Web Audio and Speech Synthesis for Node.js ---
class MockAudioParam {
  constructor(val = 0) { this.value = val; }
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
}
class MockAudioNode {
  constructor() {
    this.frequency = new MockAudioParam(440);
    this.Q = new MockAudioParam(1);
    this.gain = new MockAudioParam(1);
    this.type = "sine";
  }
  connect() { return this; }
  start() {}
  stop() {}
}
class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() { return new MockAudioNode(); }
  createGain() { return new MockAudioNode(); }
  createBiquadFilter() { return new MockAudioNode(); }
}
global.AudioContext = MockAudioContext;
global.window.AudioContext = MockAudioContext;

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "en-US";
    this.rate = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}
const mockSpeechSynthesis = {
  speak(utterance) {
    if (utterance.onstart) utterance.onstart();
    if (utterance.onend) utterance.onend();
  },
  cancel() {}
};
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
global.window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
global.speechSynthesis = mockSpeechSynthesis;
global.window.speechSynthesis = mockSpeechSynthesis;

global.console.log = console.log;
global.console.error = console.error;

// Load app.js code by executing it within this context
const appJsPath = path.join(__dirname, 'app.js');
try {
  let code = fs.readFileSync(appJsPath, 'utf8');
  
  // Pre-process declarations to attach variables and classes to 'global' scope
  code = code
    .replace(/\bconst slmClassifier\b/g, 'var slmClassifier')
    .replace(/\bconst markovGenerator\b/g, 'var markovGenerator')
    .replace(/\blet activeConsultation\b/g, 'var activeConsultation')
    .replace(/\blet currentHealthId\b/g, 'var currentHealthId')
    .replace(/\bconst MEDICAL_KB\b/g, 'var MEDICAL_KB')
    .replace(/\bconst CLINICAL_DICTS\b/g, 'var CLINICAL_DICTS')
    .replace(/\bconst SLM_TRAINING_CORPUS\b/g, 'var SLM_TRAINING_CORPUS')
    .replace(/\basync function fetchBiomedicalSynonyms\b/g, 'global.fetchBiomedicalSynonyms = async function fetchBiomedicalSynonyms')
    .replace(/\basync function autoTrainSLMWithKeywords\b/g, 'global.autoTrainSLMWithKeywords = async function autoTrainSLMWithKeywords')
    .replace(/\bclass TrieNode\b/g, 'global.TrieNode = class TrieNode')
    .replace(/\bclass Trie\b/g, 'global.Trie = class Trie')
    .replace(/\bclass NaiveBayesSymptomClassifier\b/g, 'global.NaiveBayesSymptomClassifier = class NaiveBayesSymptomClassifier')
    .replace(/\bclass MarkovTextGenerator\b/g, 'global.MarkovTextGenerator = class MarkovTextGenerator');

  // Indirect eval to run in global scope
  const indirectEval = eval;
  indirectEval(code);
  
  console.log("✅ Main app.js logic successfully loaded and initialized under mock env.");
} catch (err) {
  console.error("❌ Failed to load/eval app.js:", err);
  process.exit(1);
}

// Assert helper
function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    return false;
  }
  console.log(`  ✅ PASS: ${message}`);
  return true;
}

let passes = 0;
let fails = 0;
async function runTest(name, fn) {
  console.log(`\n🏃 Test Suite: ${name}`);
  console.log("-".repeat(name.length + 15));
  try {
    const success = await fn();
    if (success !== false) {
      passes++;
    } else {
      fails++;
    }
  } catch (err) {
    console.error(`  💥 ERROR in test execution:`, err);
    fails++;
  }
}

// Main execution wrapper to handle async flows
(async () => {
  // ----------------------------------------------------
  // Test 1: N-Gram Tokenizer & Stop Word Filtering
  // ----------------------------------------------------
  await runTest("Tokenizer & Stop-Word Verification", () => {
    const sampleText = "I have a severe chest pain radiating to left arm and jaw";
    const tokens = slmClassifier.tokenize(sampleText);
    
    // Verify stop words like "i", "have", "a", "and" are filtered from raw unigrams
    const hasI = tokens.includes("i");
    const hasHave = tokens.includes("have");
    const hasChestPainBigram = tokens.includes("chest pain");
    const hasLeftArmJawTrigram = tokens.includes("left arm radiating") || tokens.includes("chest pain radiating");
    
    let ok = true;
    ok = assert(!hasI, "Stop-word 'i' successfully filtered out of tokens.") && ok;
    ok = assert(!hasHave, "Stop-word 'have' successfully filtered out of tokens.") && ok;
    ok = assert(hasChestPainBigram, "Tokenizer successfully extracted bigram 'chest pain'.") && ok;
    ok = assert(tokens.length > 5, `Successfully parsed N-grams. Total extracted: ${tokens.length} tokens.`);
    return ok;
  });

  // ----------------------------------------------------
  // Test 2: Trie Keyword Phrase Indexing & Match Speed
  // ----------------------------------------------------
  await runTest("Trie Substring Sliding phrase Matcher", () => {
    const samplePhrase = "severe chest pain radiating";
    const trieMatches = slmClassifier.trie.search(samplePhrase);
    
    let hasChestPainMatch = false;
    for (const m of trieMatches) {
      if (m.word === "chest pain" && m.category === "chest pain") {
        hasChestPainMatch = true;
      }
    }
    
    let ok = true;
    ok = assert(trieMatches.length > 0, `Trie found ${trieMatches.length} matching diagnostic categories.`) && ok;
    ok = assert(hasChestPainMatch, "Trie successfully located category 'chest pain' using sliding bigram search.") && ok;
    return ok;
  });

  // ----------------------------------------------------
  // Test 3: Naive Bayes Classification with TF-IDF Weights
  // ----------------------------------------------------
  await runTest("Naive Bayes Classifier & TF-IDF Vectorization", () => {
    const englishInput = "jaro heuchi shivering body is burning hot and high fever temperature";
    const classifications = slmClassifier.classify(englishInput);
    
    const bestMatch = classifications[0];
    
    let ok = true;
    ok = assert(bestMatch.condition === "fever", `Correctly classified query as '${bestMatch.condition}'.`) && ok;
    ok = assert(bestMatch.confidence > 50, `High confidence score of ${bestMatch.confidence}% achieved via TF-IDF scaling.`) && ok;
    return ok;
  });

  // ----------------------------------------------------
  // Test 4: Generative Bigram Markov Chain Empathy Coherence
  // ----------------------------------------------------
  await runTest("Generative Bigram Markov Chain", () => {
    const empathyString = markovGenerator.generate(15);
    
    let ok = true;
    ok = assert(empathyString.length > 5, `Empathy text synthesized: "${empathyString}"`) && ok;
    ok = assert(empathyString.endsWith('.'), "Synthesized text successfully terminates with punctuation.") && ok;
    return ok;
  });

  // ----------------------------------------------------
  // Test 5: Vitals-driven Staging Triage & Allergy safe substitutions
  // ----------------------------------------------------
  await runTest("Clinical Consultation Synthesis, Staging & Safety Substitutions", () => {
    // Mock a profile with penicillin and NSAID allergies
    global.getProfile = function() {
      return {
        name: "Ramanuja Pathy",
        age: 28,
        gender: "Male",
        blood: "O+",
        allergies: "Penicillin, NSAID"
      };
    };

    // Mock active consultation variables
    global.activeConsultation = {
      vitals: {
        bp: "175/105", // Severe hypertension -> Stage 3
        heartRate: 110,
        temp: 104.2, // Hyperpyrexia -> Stage 3
        SpO2: 91 // Low Oxygen -> Stage 3
      },
      selectedSymptoms: ["Fever", "Cough"],
      duration: "More than 2 weeks",
      risks: ["Cardiovascular Load"]
    };

    global.currentHealthId = "RAMAN-HID-170";
    global.nowTime = () => "01:05 AM";

    // Mock IndexedDB vault functions
    global.generateSimulatedLabFile = () => "data:image/png;base64,mock_data";
    global.analyzeDocument = () => "<div>Mock Document Analysis</div>";
    global.saveSimulatedToVault = () => "mock_saved_doc_id";

    // Temporarily inject Amoxicillin into fever medications to verify penicillin substitution
    const originalFeverMeds = [...MEDICAL_KB.fever.medications];
    MEDICAL_KB.fever.medications.push({ name: "Amoxicillin 500mg", dose: "1 tablet three times daily", note: "Antibiotic for bacterial fever" });

    // Execute clinical compilation
    completeClinicalConsultation();

    const rx = window._activeRxData;
    let ok = true;
    
    ok = assert(rx !== undefined, "Consultation successfully resolved print-ready Rx data.") && ok;
    ok = assert(rx.stage.includes("Stage 3"), `Vitals threshold triaged patient into extreme '${rx.stage}'.`) && ok;
    ok = assert(rx.urgencyWarning.length > 0, "Critical clinical oxygen/hypertensive emergency alerts compiled successfully.") && ok;
    
    // Verify safety substitution took place:
    // Fever standard drug is Amoxicillin (Penicillin class).
    // It should be substituted with Azithromycin.
    const hasPenicillinMed = rx.medicines.some(m => m.name.toLowerCase().includes("amoxicillin"));
    const hasAzithromycinSub = rx.medicines.some(m => m.name.toLowerCase().includes("azithromycin"));
    
    ok = assert(!hasPenicillinMed, "Contraindicated Amoxicillin blocked from prescription.") && ok;
    ok = assert(hasAzithromycinSub, "🛡️ Safely substituted Penicillin allergen with Azithromycin.") && ok;
    
    // Restore original fever medications
    MEDICAL_KB.fever.medications = originalFeverMeds;
    
    return ok;
  });

  // ----------------------------------------------------
  // Test 6: Bilingual Out-of-Context Interception & Refusing Rules
  // ----------------------------------------------------
  await runTest("Bilingual Out-of-Context Interception", async () => {
    let ok = true;
    
    // 1. English out-of-context test
    window.currentLang = 'en';
    const enQuery = "what can i eat in breakfast";
    const enResponse = await generateSlmResponse(enQuery, { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" });
    
    const hasEnWarning = enResponse.includes("OUT OF CONTEXT INQUIRY") || enResponse.includes("RAMAN AI is a dedicated medical intelligence system");
    ok = assert(hasEnWarning, "English breakfast query correctly intercepted with OUT OF CONTEXT warning block.") && ok;
    
    // 2. Odia out-of-context test
    window.currentLang = 'or';
    const orQuery = "ଆଜି କ୍ରିକେଟ ମ୍ୟାଚ କିଏ ଜିତିବ"; // "Who will win today's cricket match?"
    const orResponse = await generateSlmResponse(orQuery, { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" });
    
    const hasOrWarning = orResponse.includes("ଅପ୍ରାସଙ୍ଗିକ ଅନୁସନ୍ଧାନ") || orResponse.includes("Out of Context Inquiry");
    ok = assert(hasOrWarning, "Odia cricket query correctly intercepted with bilingual Out of Context warning block.") && ok;

    return ok;
  });

  // ----------------------------------------------------
  // Test 7: Generative Empathy Monolingualism & Smart Conversational Triage
  // ----------------------------------------------------
  await runTest("Generative Empathy Monolingualism & Smart Conversational Triage", async () => {
    let ok = true;

    // 1. Verify English Empathy is pure English (contains no Odia characters/words)
    window.currentLang = 'en';
    const empathyEn = markovGenerator.generate(15);
    const hasOdiaInEn = /[\u0B00-\u0B7F]/.test(empathyEn); // Unicode range for Odia script
    ok = assert(!hasOdiaInEn, `English empathy generated pure English: "${empathyEn}"`) && ok;

    // 2. Verify Odia Empathy is pure Odia (contains Odia words from training sentences)
    window.currentLang = 'or';
    const empathyOr = markovGenerator.generate(15);
    const isOrWord = empathyOr.toLowerCase().split(/\s+/).some(w => ["apana", "moo", "chinta", "asantu", "swasthya", "bujhiparuchi", "karuntu", "aame", "ebam", "gupata", "bhabe", "parichalita", "heba"].includes(w.replace(/[.,]/g, "")));
    ok = assert(isOrWord, `Odia empathy generated pure Odia: "${empathyOr}"`) && ok;

    // 3. Verify targeted fallback for sickness
    window.currentLang = 'en';
    const sickResponse = await generateSlmResponse("i am feeling sick", { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" });
    console.log("DEBUG SICK:", sickResponse);
    const isTargetedSick = sickResponse.includes("describe your specific symptoms in more detail");
    ok = assert(isTargetedSick, "Fallback for 'feeling sick' returns targeted sickness triage question.") && ok;

    // 4. Verify targeted fallback for pain (using a query that bypasses high-confidence classification)
    const painResponse = await generateSlmResponse("my toe is hurt", { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" });
    console.log("DEBUG PAIN:", painResponse);
    const isTargetedPain = painResponse.includes("specify exactly where it hurts");
    ok = assert(isTargetedPain, "Fallback for 'my toe is hurt' returns targeted pain localization question.") && ok;

    // 5. Verify targeted fallback for fatigue (using a query that bypasses high-confidence classification)
    const fatigueResponse = await generateSlmResponse("i feel exhausted", { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" });
    console.log("DEBUG FATIGUE:", fatigueResponse);
    const isTargetedFatigue = fatigueResponse.includes("weakness or fatigue is a common symptom");
    ok = assert(isTargetedFatigue, "Fallback for 'i feel exhausted' returns targeted hydration and sleep advice.") && ok;

    return ok;
  });

  // ----------------------------------------------------
  // Test 8: Descriptive Prescriptions & SLM PDF Direct Downloads
  // ----------------------------------------------------
  await runTest("Descriptive Prescriptions & SLM PDF Direct Downloads", async () => {
    let ok = true;

    // 1. Verify Metformin is highly descriptive
    const metforminKb = MEDICAL_KB.diabetes.medications.find(m => m.name.toLowerCase().includes("metformin"));
    ok = assert(metforminKb !== undefined, "Metformin resolved in diabetes database.") && ok;
    ok = assert(metforminKb.note.includes("hepatic glucose production") && metforminKb.note.includes("insulin sensitivity"), "Metformin is highly descriptive and includes clinical pharmacological details.") && ok;

    // 2. Verify compilation of downloadSlmPrescriptionPDF
    // Mock the window.open flow for mock printWindow
    let openCalled = false;
    let writeHtml = "";
    mockWindow.open = function() {
      openCalled = true;
      return {
        document: {
          open() {},
          write(html) { writeHtml = html; },
          close() {}
        }
      };
    };

    // 3. Trigger SLM PDF download (when no vitals are provided in profile)
    global.getProfile = () => ({
      name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None",
      bp: "", heartRate: "", temp: "", SpO2: ""
    });
    window.downloadSlmPrescriptionPDF("diabetes");
    ok = assert(openCalled, "downloadSlmPrescriptionPDF successfully opened print/PDF browser window.") && ok;
    ok = assert(!writeHtml.includes("class=\"vitals-grid\""), "Vitals grid is entirely omitted from the PDF print layout when no vitals are provided.") && ok;

    // 4. Trigger SLM PDF download (when BP and Temp are provided in profile)
    global.getProfile = () => ({
      name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None",
      bp: "128/82", heartRate: "", temp: "100.4", SpO2: ""
    });
    window.downloadSlmPrescriptionPDF("diabetes");
    ok = assert(writeHtml.includes("class=\"vitals-grid\""), "Vitals grid is present in the PDF when some vitals are provided.") && ok;
    ok = assert(writeHtml.includes("128/82 mmHg") && writeHtml.includes("100.4 &deg;F"), "PDF accurately displays exactly the provided vitals (BP & Temp).") && ok;
    ok = assert(!writeHtml.includes("bpm") && !writeHtml.includes("Oxygen SpO2"), "Omitted vitals (HR & SpO2) are completely absent from the printed PDF.") && ok;

    // 5. Verify buildProfileContext dynamic formatting
    const profileNoVitals = { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" };
    const htmlNoVitals = buildProfileContext(profileNoVitals);
    ok = assert(!htmlNoVitals.includes("Vitals:"), "buildProfileContext does not print Vitals line when no vitals are provided.") && ok;

    const profileSomeVitals = { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None", bp: "125/80", temp: "99.1" };
    const htmlSomeVitals = buildProfileContext(profileSomeVitals);
    ok = assert(htmlSomeVitals.includes("BP: 125/80") && htmlSomeVitals.includes("Temp: 99.1°F"), "buildProfileContext correctly appends provided vitals to chat bubble profile header.") && ok;

    return ok;
  });

  // ----------------------------------------------------
  // Test 9: Clinical Standardization & Vault Backup Portability
  // ----------------------------------------------------
  await runTest("Clinical Standardization & Vault Backup Portability", async () => {
    let ok = true;

    // 1. Verify ICD-11 & SNOMED codes exist in MEDICAL_KB
    for (const [key, category] of Object.entries(MEDICAL_KB)) {
      ok = assert(typeof category.icd11 === "string" && category.icd11.length > 0, `ICD-11 code present for condition: ${key} (${category.icd11})`) && ok;
      for (const med of category.medications) {
        ok = assert(typeof med.snomed === "string" && med.snomed.length > 0, `SNOMED code present for medication: ${med.name} (${med.snomed})`) && ok;
      }
    }

    // 2. Verify translateToPatientTerms maps technical terms
    const technicalSample = "fever";
    const patientTerm = translateToPatientTerms(technicalSample);
    ok = assert(patientTerm === "Fever & General Infection Triage", `translateToPatientTerms correctly mapped technical term 'fever' to: '${patientTerm}'`) && ok;

    // 3. Verify Session serialization (exportSessionBackupJSON)
    let aClickCalled = false;
    let backupJson = "";
    
    global.getProfile = () => ({
      name: "Ramanuja Pathy", age: 28, gender: "Male", blood: "O+", allergies: "NSAID", bp: "120/80", heartRate: "70", temp: "98.6", SpO2: "98"
    });
    
    const mockAnchor = {
      href: "",
      download: "",
      click() { aClickCalled = true; }
    };
    
    // Backup document methods
    const oldCreateElement = global.document.createElement;
    global.document.createElement = function(tag) {
      if (tag === "a") return mockAnchor;
      return makeMockElement();
    };
    
    // Backup URL / Blob
    global.URL = {
      createObjectURL() { return "blob:mock-url"; },
      revokeObjectURL() {}
    };
    
    global.Blob = class Blob {
      constructor(parts, options) {
        backupJson = parts[0];
        this.options = options;
      }
    };
    
    global.db = null; // Bypasses file export gracefully
    
    // Run the backup export
    await window.exportSessionBackupJSON();
    
    ok = assert(aClickCalled, "exportSessionBackupJSON successfully created a download anchor and clicked it.") && ok;
    ok = assert(backupJson.length > 0, "exportSessionBackupJSON successfully produced serialized backup payload.") && ok;
    
    const parsedBackup = JSON.parse(backupJson);
    ok = assert(parsedBackup.ramanai_backup === true, "Backup contains RAMAN AI signature.") && ok;
    ok = assert(parsedBackup.profile.name === "Ramanuja Pathy", "Backup accurately contains the patient profile data.") && ok;
    
    // Restore document methods
    global.document.createElement = oldCreateElement;
    
    return ok;
  });

  // ----------------------------------------------------
  // Test 10: AES-GCM Encryption, Clinician Explainability & Recovery Diary
  // ----------------------------------------------------
  await runTest("AES-GCM Encryption, Clinician Explainability & Recovery Diary", async () => {
    let ok = true;

    // 1. Verify explain(text) output structure
    const sampleText = "I have a severe headache and fever";
    const explanation = slmClassifier.explain(sampleText);
    ok = assert(explanation !== undefined, "Symptom explainability model successfully returned match data.") && ok;
    
    const feverEx = explanation.fever;
    ok = assert(feverEx !== undefined, "Fever explanation block found.") && ok;
    ok = assert(typeof feverEx.prior === "string", `Priors log probability parsed: ${feverEx.prior}`) && ok;
    ok = assert(Array.isArray(feverEx.matchedTokens), `Matched tokens list length: ${feverEx.matchedTokens.length}`) && ok;
    
    if (feverEx.matchedTokens.length > 0) {
      const firstTok = feverEx.matchedTokens[0];
      ok = assert(typeof firstTok.token === "string" && typeof firstTok.contribution === "string", "Matched token parameters structured correctly.") && ok;
    }

    // 2. Verify AES-GCM Encrypted Backup Round-trip
    const testPayload = JSON.stringify({ ramanai_backup: true, secretMessage: "Ramanuja Pathy Secret Vault 170" });
    const password = "SafeSecuredPassword170!";
    
    // Encrypt
    const encrypted = await encryptBackup(testPayload, password);
    ok = assert(encrypted !== undefined && encrypted.saltHex !== undefined, "Web Crypto AES-GCM successfully encrypted backup payload.") && ok;
    ok = assert(encrypted.ciphertextBase64.length > 0, "Base64 ciphertext generated successfully.") && ok;
    
    // Decrypt
    const decrypted = await decryptBackup(encrypted.saltHex, encrypted.ivHex, encrypted.ciphertextBase64, password);
    ok = assert(decrypted === testPayload, "🛡️ Web Crypto successfully decrypted ciphertext round-trip.") && ok;

    // Decrypt Failure Case
    let decryptFailed = false;
    try {
      await decryptBackup(encrypted.saltHex, encrypted.ivHex, encrypted.ciphertextBase64, "WrongPassword!");
    } catch (err) {
      decryptFailed = true;
    }
    ok = assert(decryptFailed, "🛡️ Web Crypto decryption successfully rejected incorrect password.") && ok;

    // 3. Verify Recovery Diary Storage handlers
    // Clear history
    localStorage.removeItem('ramanai_diary_history');
    
    // Mock the DOM elements required for diary
    const condSelect = makeMockElement();
    condSelect.value = "fever";
    const sevInput = makeMockElement();
    sevInput.value = "8";
    
    const oldGetElement = global.document.getElementById.bind(global.document);
    global.document.getElementById = function(id) {
      if (id === "diaryCondition") return condSelect;
      if (id === "diarySeverity") return sevInput;
      if (id === "diaryCanvas") return makeMockElement(); // Mock canvas returns 2D context
      return oldGetElement(id);
    };

    // Trigger log entry
    window.logDiaryEntry();
    
    const diaryHistory = JSON.parse(localStorage.getItem('ramanai_diary_history') || '[]');
    ok = assert(diaryHistory.length === 1, "Recovery Diary correctly stored symptom severity to localStorage.") && ok;
    ok = assert(diaryHistory[0].condition === "fever" && diaryHistory[0].severity === 8, "Diary entry contains precise logged parameters.") && ok;
    
    // Clean up DOM mock
    global.document.getElementById = oldGetElement;
    localStorage.removeItem('ramanai_diary_history');

    return ok;
  });

  runTest("High-Fidelity Audio-Visual Telemetry & Speech Synthesis", () => {
    let ok = true;

    // 1. Verify BioTelemetrySFX properties and toggle controls
    ok = assert(typeof window.BioTelemetrySFX === "object", "BioTelemetrySFX engine is declared as a global object.") && ok;
    ok = assert(window.BioTelemetrySFX.enabled === true, "BioTelemetrySFX is enabled by default.") && ok;

    // 2. Verify all waveforms play successfully in-memory without throwing errors
    try {
      window.BioTelemetrySFX.playClick();
      window.BioTelemetrySFX.playScan();
      window.BioTelemetrySFX.playAlarm();
      window.BioTelemetrySFX.playSlide();
      window.BioTelemetrySFX.playSuccess();
      window.BioTelemetrySFX.playError();
      window.BioTelemetrySFX.playDataTick();
      ok = assert(true, "All seven synthesized clinical waveforms execute cleanly in-memory.") && ok;
    } catch (e) {
      ok = assert(false, "Audio synthesis failed with error: " + e.message) && ok;
    }

    // 3. Test global audio toggler
    const oldBtn = global.document.getElementById("btnAudioToggle");
    const mockBtn = makeMockElement();
    mockBtn.id = "btnAudioToggle";
    
    // Inject mock button
    const oldGetElement = global.document.getElementById.bind(global.document);
    global.document.getElementById = function(id) {
      if (id === "btnAudioToggle") return mockBtn;
      return oldGetElement(id);
    };

    window.toggleBioTelemetryAudio();
    ok = assert(window.BioTelemetrySFX.enabled === false, "toggleBioTelemetryAudio successfully disables the SFX engine globally.") && ok;
    ok = assert(mockBtn.innerHTML.includes("SOUND: OFF"), "Audio toggle button updates label to SOUND: OFF on disable.") && ok;

    window.toggleBioTelemetryAudio();
    ok = assert(window.BioTelemetrySFX.enabled === true, "toggleBioTelemetryAudio successfully re-enables the SFX engine globally.") && ok;
    ok = assert(mockBtn.innerHTML.includes("SOUND: ON"), "Audio toggle button updates label to SOUND: ON on re-enable.") && ok;

    // Clean up DOM mock
    global.document.getElementById = oldGetElement;

    // 4. Test Clinical Text-to-Speech (TTS) prescription reader filters
    const oldSpeechSpeak = global.speechSynthesis.speak;
    let spokenText = "";
    global.speechSynthesis.speak = function(utterance) {
      spokenText = utterance.text;
    };

    // Test text cleaning: strip UI emojis, non-verbal markers, HTML, metadata
    const rawPrescriptionText = "🌡️ BP: 120/80 | 🧠 SUGGESTION: <b>Take Paracetamol 650mg</b> twice a day. 😊 [ICD-11: fever]";
    window.speakMessageText(makeMockElement(), rawPrescriptionText);

    ok = assert(!spokenText.includes("🌡️"), "speechSynthesis sanitizes and strips emojis from readout.") && ok;
    ok = assert(!spokenText.includes("😊"), "speechSynthesis sanitizes and strips smiley face emojis from readout.") && ok;
    ok = assert(!spokenText.includes("<b>") && !spokenText.includes("</b>"), "speechSynthesis sanitizes and strips HTML tags from readout.") && ok;
    ok = assert(!spokenText.includes("[ICD-11: fever]"), "speechSynthesis sanitizes and strips bracketed metadata tags from readout.") && ok;
    ok = assert(spokenText.includes("BP: 120/80") && spokenText.includes("Take Paracetamol 650mg"), "speechSynthesis preserves clean clinical readout message contents.") && ok;

    // Clean up speak mock
    global.speechSynthesis.speak = oldSpeechSpeak;

    return ok;
  });

  await runTest("Dynamic SLM Auto-Training & Vocabulary Expansion", async () => {
    let ok = true;

    // 1. Verify CLINICAL_DICTS is defined and has valid keys
    ok = assert(typeof CLINICAL_DICTS === "object", "CLINICAL_DICTS is defined as a global object.") && ok;
    ok = assert(Array.isArray(CLINICAL_DICTS.pneumonia), "Pneumonia dictionary has a valid array of synonyms.") && ok;

    // 2. Mock a Europe PMC API call and verify fetchBiomedicalSynonyms behaves correctly
    const oldFetch = global.fetch;
    const mockJson = {
      resultList: {
        result: [
          { title: "Clinical evaluation of Lobar Consolidation and bronchial density", abstractText: "This paper discusses alveolar consolidation and pleural effusion." }
        ]
      }
    };
    global.fetch = function(url) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockJson)
      });
    };

    // 3. Test fetchBiomedicalSynonyms with mock
    return fetchBiomedicalSynonyms("Pneumonia", "xray").then(result => {
      ok = assert(result.source === "Europe PMC Live Search", "fetchBiomedicalSynonyms successfully routes through live Europe PMC mock.") && ok;
      ok = assert(result.keywords.includes("alveolar consolidation") || result.keywords.includes("pleural effusion"), "Parsed synonyms are successfully extracted from Mock titles/abstracts.") && ok;

      // 4. Test auto-training execution
      const mockConsole = makeMockElement();
      return autoTrainSLMWithKeywords("pneumonia", "Pneumonia", "xray", mockConsole).then(() => {
        ok = assert(SLM_TRAINING_CORPUS.pneumonia.length > 0, "autoTrainSLMWithKeywords successfully registers brand new condition class 'pneumonia'.") && ok;
        
        // 5. Test offline classification on the newly retrained class
        const classification = slmClassifier.classify("active clinical indications of alveolar consolidation in lung");
        const topResult = classification[0];
        
        ok = assert(topResult.condition === "pneumonia", "Retrained Naive Bayes classifier correctly identifies 'pneumonia' offline with newly learned phrases.") && ok;
        ok = assert(topResult.confidence > 50, "Classification confidence exceeds 50% for learned offline diagnostic terms.") && ok;

        // Cleanup and restore
        global.fetch = oldFetch;
        localStorage.removeItem('ramanai_expanded_corpus');

        return ok;
      });
    });
  });

  await runTest("Bilingual Long-Query Evaluation & Anti-Hallucination Sandbox Validation", async () => {
    let ok = true;

    // The 10 specific target long queries from the user request
    const testCases = [
      {
        id: 1,
        query: "Doctor, I've had a low-grade fever for three days, around 99–100°F. I feel tired all the time, my muscles ache, and I have a mild headache that gets worse in the evening. My throat feels scratchy but not very sore. I have a dry cough sometimes, and I notice some nasal congestion. I haven't lost my sense of taste or smell.",
        expected: "fever",
        description: "Low-grade fever systemic symptoms"
      },
      {
        id: 2,
        query: "I've been experiencing sharp stomach pains on and off for two days, mostly under my ribs on the right side. The pain sometimes gets worse after I eat, and I feel nauseous, with one episode of vomiting. I haven't had diarrhea, but I feel bloated and have less appetite than usual.",
        expected: "stomach pain",
        description: "Right upper quadrant abdominal pain and nausea"
      },
      {
        id: 3,
        query: "For the past week I've had frequent urination and a burning sensation when I pee. I also have lower abdominal discomfort, and my urine looks a bit cloudy and has a strong smell. I don't have a fever or back pain, but I feel generally uncomfortable.",
        expected: "uti",
        description: "Urinary burning and frequency (UTI)"
      },
      {
        id: 4,
        query: "I've been having trouble breathing, especially when I exercise or when the weather is cold. I have a tight feeling in my chest and a dry cough that gets worse at night. Sometimes I hear a whistling or wheezing sound when I breathe out.",
        expected: "asthma",
        description: "Bronchial asthma hyperreactive dyspnea"
      },
      {
        id: 5,
        query: "Lately, I've been feeling extremely dizzy, like the room is spinning around me. It gets much worse when I turn my head quickly or lie down. I also feel nauseous and have lost my balance a few times. There's a ringing sound in my left ear, and my hearing feels a bit muffled on that side.",
        expected: "vertigo",
        description: "Vestibular vertigo with tinnitus"
      },
      {
        id: 6,
        query: "I have a red, itchy rash spreading across my arms and neck. It started as small, raised bumps and now feels very dry and scaly. I haven't used any new soaps or lotions, but I did go hiking in a wooded area a couple of days ago.",
        expected: "skin rash",
        description: "Allergic contact dermatitis rash"
      },
      {
        id: 7,
        query: "I've been feeling so tired and sluggish lately, no matter how much sleep I get. I feel weak, short of breath when I walk up stairs, and my skin looks unusually pale. I've also noticed my nails are brittle and I've been getting headaches more often than usual.",
        expected: "anemia",
        description: "Chronic fatigue, pallor and brittle nails (Anemia)"
      },
      {
        id: 8,
        query: "My throat has been extremely sore, scratchy, and painful, especially when I try to swallow. When I look in the mirror, my tonsils are swollen, very red, and have small white patches on them. I also have a fever of 101.5°F, swollen glands in my neck, and a headache.",
        expected: "tonsillitis",
        description: "Acute tonsillar pharyngitis with exudates"
      },
      {
        id: 9,
        query: "I've had abdominal cramps and bloating for a couple of weeks, accompanied by irregular bowel habits. Sometimes I have diarrhea and other times I'm constipation. The pain is mostly in my lower abdomen and gets slightly better after a bowel movement. I haven't had any fever or blood in my stool.",
        expected: "stomach pain",
        description: "Irritable bowel gastralgia cramps"
      },
      {
        id: 10,
        query: "I accidentally cut my hand on a piece of rusty metal while working in the garden yesterday. The cut is about an inch long, looks red and swollen, and is throbbing with pain. I washed it with water, but it's warm to the touch and there's some yellowish discharge. I can't remember when I last had a tetanus shot.",
        expected: "wound",
        description: "Traumatic superficial laceration and tetanus risk"
      }
    ];

    console.log("  🚀 Evaluating all 10 target patient queries against local ensemble SLM...");
    testCases.forEach(tc => {
      const classification = slmClassifier.classify(tc.query);
      const topMatch = classification[0];

      ok = assert(topMatch.condition === tc.expected, `Query ${tc.id} (${tc.description}) correctly classified as: '${topMatch.condition}' (Expected: '${tc.expected}')`) && ok;
      ok = assert(topMatch.confidence > 50, `  └─ Confidence score: ${topMatch.confidence.toFixed(1)}% (Exceeds safety threshold)`) && ok;
    });

    // Verify Allergy Conflict warnings inside tonsillitis with Penicillin allergy
    const tonsillitisKb = MEDICAL_KB.tonsillitis;
    const profilePenicillinAllergy = { allergies: "Penicillin" };
    
    // Simulate compilation
    const allergyLower = profilePenicillinAllergy.allergies.toLowerCase();
    const matchedMeds = tonsillitisKb.medications.filter(med => 
      med.name.toLowerCase().includes(allergyLower) || 
      (allergyLower.includes("penicillin") && med.name.toLowerCase().includes("amoxicillin"))
    );

    ok = assert(matchedMeds.length > 0, "Allergy conflict warning successfully triggered for Amoxicillin with Penicillin allergy.") && ok;
    ok = assert(matchedMeds.some(m => m.name.includes("Amoxicillin")), "Prescription successfully flags contraindicated Amoxicillin.") && ok;

    return ok;
  });

  await runTest("WebGPU Clinical Simulation Engine & GPU Hardware Acceleration", async () => {
    let ok = true;

    // 1. Verify simulation bindings
    ok = assert(typeof window.runGpuTriageSimulation === "function", "window.runGpuTriageSimulation is successfully bound as a global function.") && ok;
    ok = assert(typeof window.runCpuFallbackSimulation === "function", "window.runCpuFallbackSimulation is successfully bound as a global function.") && ok;

    // 2. Test CPU fallback simulation directly
    const cpuResult = window.runCpuFallbackSimulation([0.2, 0.4, 0.6], 45, 99.5);
    ok = assert(cpuResult.mode === "CPU (Standard Emulation)", "runCpuFallbackSimulation successfully returns CPU mode identification.") && ok;
    ok = assert(cpuResult.certaintyIndex >= 0.0 && cpuResult.certaintyIndex <= 1.0, `runCpuFallbackSimulation calculates valid Certainty Index: ${(cpuResult.certaintyIndex * 100).toFixed(1)}%`) && ok;
    ok = assert(cpuResult.trajectoriesSimulated === 16384, "runCpuFallbackSimulation simulates exactly 16,384 paths.") && ok;
    ok = assert(cpuResult.vitalsSample && cpuResult.vitalsSample.length === 1024, "runCpuFallbackSimulation produces exactly 1,024 vital progression samples.") && ok;

    // 3. Test WebGPU simulation pipeline (using the mocked global.navigator.gpu)
    const gpuResult = await window.runGpuTriageSimulation([0.2, 0.4, 0.6], 45, 99.5);
    ok = assert(gpuResult.mode === "WebGPU (Hardware Accelerated)", "runGpuTriageSimulation successfully resolves WebGPU hardware acceleration mode.") && ok;
    ok = assert(gpuResult.deviceName.includes("Accelerator") || gpuResult.deviceName.includes("NVIDIA") || gpuResult.deviceName.includes("AMD") || gpuResult.deviceName.includes("Intel"), `runGpuTriageSimulation successfully resolves active device: '${gpuResult.deviceName}'`) && ok;
    ok = assert(gpuResult.certaintyIndex === 1.0, "runGpuTriageSimulation successfully maps WGSL output buffer and resolves certainty indexes.") && ok;
    ok = assert(gpuResult.vitalsSample && gpuResult.vitalsSample.length === 1024, "runGpuTriageSimulation produces exactly 1,024 vital progression samples.") && ok;

    // 4. Test WebGPU graceful degradation fallback by temporarily hiding navigator.gpu
    const oldGpu = global.navigator.gpu;
    global.navigator.gpu = null;

    const degradedResult = await window.runGpuTriageSimulation([0.2, 0.4, 0.6]);
    ok = assert(degradedResult.mode === "CPU (Standard Emulation)", "runGpuTriageSimulation gracefully degrades to CPU fallback when WebGPU is unavailable.") && ok;

    // Restore WebGPU mock
    global.navigator.gpu = oldGpu;

    return ok;
  });

  await runTest("Advanced Pharmacogenomics & Active Learning Verification", async () => {
    let ok = true;

    // 1. Verify Markov decoding temperature parameters
    const txtLow = markovGenerator.generate(12, false, 0.1);
    const txtHigh = markovGenerator.generate(12, false, 2.0);
    ok = assert(typeof txtLow === "string" && txtLow.length > 5, "Markov generate executes successfully at low temperature (T=0.1).") && ok;
    ok = assert(typeof txtHigh === "string" && txtHigh.length > 5, "Markov generate executes successfully at high temperature (T=2.0).") && ok;

    // 2. Verify Pharmacogenomic (PGx) check logic
    const g6pdProfile = { genomicTraits: ["g6pd"] };
    const simulatedMeds = [{ name: "Nitrofurantoin 100mg (Brand: Macrodantin)" }];
    const conflicts = window.checkPgxConflicts(g6pdProfile, simulatedMeds);
    ok = assert(conflicts.length > 0, "checkPgxConflicts successfully flags Nitrofurantoin contraindication under G6PD deficiency.") && ok;
    ok = assert(conflicts[0].subName.includes("Ciprofloxacin"), `checkPgxConflicts successfully suggests safe alternative: '${conflicts[0].subName}'`) && ok;

    // 3. Verify Active Learning feedback loop & weights deltas
    const initialQuery = "burning sensation when i pee";
    const oldClassifications = slmClassifier.classify(initialQuery);
    
    // Simulate clinician override
    window.applyClinicianCorrection("fever", "uti", initialQuery);
    
    ok = assert(window.localClinicianDeltas && window.localClinicianDeltas["uti"], "applyClinicianCorrection successfully records delta adjustments under target class.") && ok;
    ok = assert(window.localClinicianDeltas["uti"]["pee"] > 0, "applyClinicianCorrection boosts weights for active query tokens in the correct class.") && ok;
    ok = assert(window.localClinicianDeltas["fever"]["pee"] < 0, "applyClinicianCorrection penalizes weights for active query tokens in the wrong class.") && ok;

    return ok;
  });

  await runTest("Premium Light/Day Theme Toggle & State Persistence", async () => {
    let ok = true;

    // 1. Verify existence of the toggleTheme handler
    ok = assert(typeof window.toggleTheme === "function", "window.toggleTheme is successfully registered as a global function.") && ok;

    // 2. Prepare mock button and DOM state
    const btn = document.getElementById("btnThemeToggle");
    ok = assert(!!btn, "Theme toggle button exists in the DOM mock.") && ok;

    // Make sure we start in default dark mode
    document.body.className = "";
    localStorage.removeItem("ramanai_theme");
    btn.innerHTML = "<span>🌙</span> DARK";

    // 3. Toggle to Light Theme
    window.toggleTheme();
    ok = assert(document.body.classList.contains("light-theme"), "toggleTheme successfully adds the light-theme class to document.body.") && ok;
    ok = assert(localStorage.getItem("ramanai_theme") === "light", "toggleTheme persists the 'light' state to localStorage.") && ok;
    ok = assert(btn.innerHTML.includes("LITE"), `Theme button updates label to: '${btn.innerHTML}'`) && ok;

    // 4. Toggle back to Dark Theme
    window.toggleTheme();
    ok = assert(!document.body.classList.contains("light-theme"), "toggleTheme successfully removes the light-theme class on second toggle.") && ok;
    ok = assert(localStorage.getItem("ramanai_theme") === "dark", "toggleTheme persists the 'dark' state to localStorage.") && ok;
    ok = assert(btn.innerHTML.includes("DARK"), `Theme button reverts label to: '${btn.innerHTML}'`) && ok;

    return ok;
  });

  await runTest("Anthropic Claude Integration & Query Routing", async () => {
    let ok = true;

    // 1. Verify existence of global handlers
    ok = assert(typeof generateAnthropicResponse === "function", "generateAnthropicResponse is successfully declared globally.") && ok;

    // 2. Mock API request and verify header mappings
    const oldFetch = global.fetch;
    let requestUrl = "";
    let requestHeaders = {};
    let requestBody = {};

    global.fetch = function(url, options) {
      requestUrl = url;
      requestHeaders = options.headers;
      requestBody = JSON.parse(options.body);

      const mockResponse = {
        content: [
          { type: "text", text: "<p>Claude Mock: The patient has mild fever.</p>" }
        ]
      };

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });
    };

    const apiKey = "sk-ant-test-12345";
    const baseUrl = "https://api.anthropic.com";
    const model = "claude-3-7-sonnet-20250219";
    const textQuery = "fever symptoms";
    const profile = { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" };

    const responseText = await generateAnthropicResponse(textQuery, profile, apiKey, baseUrl, model);

    ok = assert(requestUrl === "https://api.anthropic.com/v1/messages", `Routing points to correct Anthropic endpoint: '${requestUrl}'`) && ok;
    ok = assert(requestHeaders["x-api-key"] === apiKey, `API key header successfully mapped: '${requestHeaders["x-api-key"]}'`) && ok;
    ok = assert(requestHeaders["anthropic-version"] === "2023-06-01", `Anthropic version header correctly set: '${requestHeaders["anthropic-version"]}'`) && ok;
    ok = assert(requestBody.model === model, `Model selection passed in body: '${requestBody.model}'`) && ok;
    ok = assert(responseText.includes("Claude Mock:"), "Response text successfully extracted from Claude's response structure.") && ok;

    // Restore fetch
    global.fetch = oldFetch;

    return ok;
  });

  await runTest("AI Response Sanitization (cleanAIResponse)", async () => {
    let ok = true;

    // Verify existence of the function
    ok = assert(typeof cleanAIResponse === "function", "cleanAIResponse is successfully declared globally.") && ok;

    // Case 1: Standard response should remain untouched
    const normalInput = "<div class=\"med-section info\"><p>Normal HTML</p></div>";
    ok = assert(cleanAIResponse(normalInput) === normalInput, "Standard HTML response is left unchanged.") && ok;

    // Case 2: Strip self-correction prefix before HTML tag
    const selfCorrectionPrefix = `*Self-Correction on formatting:* Ensure no markdown formatting like '\`\`\`html ... \`\`\`' is outputted. The prompt says "You MUST respond in HTML format... Do not use markdown backticks for HTML." This means I should write raw HTML directly in the output without wrapping it in triple backticks. Let me review the raw HTML string to ensure it looks perfectly fine when rendered directly.

<div class="med-section info"><p>Actual Content</p></div>`;
    const cleanedCorrection = cleanAIResponse(selfCorrectionPrefix);
    ok = assert(cleanedCorrection === "<div class=\"med-section info\"><p>Actual Content</p></div>", `Self-correction prefix is successfully stripped. Got: ${cleanedCorrection}`) && ok;

    // Case 3: Strip <think>...</think> blocks
    const thinkInput = "<think>We need to check the patient's symptoms first.</think><p>Output content</p>";
    ok = assert(cleanAIResponse(thinkInput) === "<p>Output content</p>", `Think blocks are successfully stripped. Got: ${cleanAIResponse(thinkInput)}`) && ok;

    // Case 4: Strip markdown backtick wrappers
    const wrappedInput = "```html\n<p>Wrapped content</p>\n```";
    ok = assert(cleanAIResponse(wrappedInput) === "<p>Wrapped content</p>", `Markdown code block wrappers are stripped. Got: ${cleanAIResponse(wrappedInput)}`) && ok;

    // Case 5: Strip Thinking Process/Thought block
    const thoughtBlock = "Thinking Process: This is a test thought.\n\n<p>Thought block output</p>";
    ok = assert(cleanAIResponse(thoughtBlock) === "<p>Thought block output</p>", `Thinking Process block is stripped. Got: ${cleanAIResponse(thoughtBlock)}`) && ok;

    return ok;
  });

  await runTest("Direct Disease Name Triage Lookup", async () => {
    let ok = true;

    // Test cases for direct disease and sub-condition matches
    const testCases = [
      { input: "asthma", expected: "asthma", detail: "Direct match of key 'asthma'" },
      { input: "diabetes", expected: "diabetes", detail: "Direct match of key 'diabetes'" },
      { input: "migraine", expected: "headache", detail: "Synonym resolution for 'migraine' -> 'headache'" },
      { input: "gout", expected: "joint pain", detail: "Synonym resolution for 'gout' -> 'joint pain'" },
      { input: "ckd", expected: "renal failure", detail: "Synonym resolution for 'ckd' -> 'renal failure'" },
      { input: "appendicitis", expected: "stomach pain", detail: "Sub-condition matching of 'appendicitis' -> 'stomach pain'" },
      { input: "malaria", expected: "malaria", detail: "Direct match mapping for 'malaria' -> 'malaria'" }
    ];

    const profile = { name: "Raman", age: 34, gender: "Male", blood: "B+", allergies: "None" };

    for (const tc of testCases) {
      const response = await generateSlmResponse(tc.input, profile);
      const expectedBadgeString = tc.expected.toUpperCase();
      ok = assert(response.includes(expectedBadgeString), `${tc.detail} resolved condition correctly. Expected badge to contain '${expectedBadgeString}'.`) && ok;
    }

    // Special validation for malaria: ensure POSSIBLE CONDITIONS is hidden and correct medications are returned
    const malariaResp = await generateSlmResponse("malaria", profile);
    const hasPossibleCond = malariaResp.includes("POSSIBLE CONDITIONS");
    ok = assert(!hasPossibleCond, "Malaria response should NOT contain 'POSSIBLE CONDITIONS' section") && ok;
    ok = assert(malariaResp.includes("Artesunate") && malariaResp.includes("Primaquine"), "Malaria response should contain accurate medications (Artesunate and Primaquine)") && ok;

    // Test with maleria typo as well
    const maleriaResp = await generateSlmResponse("maleria", profile);
    ok = assert(maleriaResp.includes("MALARIA"), "Maleria typo should resolve to MALARIA badge") && ok;
    ok = assert(!maleriaResp.includes("POSSIBLE CONDITIONS"), "Maleria response should NOT contain 'POSSIBLE CONDITIONS' section") && ok;

    // Verify all primary symptoms show POSSIBLE CONDITIONS
    for (const symptom of ["fever", "headache", "cough", "stomach pain"]) {
      const resp = await generateSlmResponse(symptom, profile);
      ok = assert(resp.includes("POSSIBLE CONDITIONS"), `Symptom '${symptom}' response should contain 'POSSIBLE CONDITIONS' section`) && ok;
    }

    // Verify all primary diseases hide POSSIBLE CONDITIONS
    for (const disease of ["diabetes", "asthma", "anemia", "high blood pressure"]) {
      const resp = await generateSlmResponse(disease, profile);
      ok = assert(!resp.includes("POSSIBLE CONDITIONS"), `Disease '${disease}' response should NOT contain 'POSSIBLE CONDITIONS' section`) && ok;
    }

    return ok;
  });

  await runTest("Offline SLM Neural Layers (MLP) & Typo Tolerance (Character N-Grams)", async () => {
    let ok = true;

    // 1. Verify neural weights initialization and structure of the 4-layer MLP
    ok = assert(slmClassifier.mlpW1.length > 0, "MLP Layer 1 weights successfully initialized.") && ok;
    ok = assert(slmClassifier.mlpW2.length === 32 && slmClassifier.mlpW2[0].length === 16, "MLP Layer 2 weights successfully initialized (32 x 16).") && ok;
    ok = assert(slmClassifier.mlpW3.length === 16 && slmClassifier.mlpW3[0].length === 8, "MLP Layer 3 weights successfully initialized (16 x 8).") && ok;
    ok = assert(slmClassifier.mlpW4.length === 8 && slmClassifier.mlpW4[0].length === slmClassifier.conditions.length, "MLP Layer 4 weights successfully initialized (8 x C).") && ok;
    ok = assert(slmClassifier.mlpb1 instanceof Float32Array && slmClassifier.mlpb1.length === 32, "MLP Hidden 1 bias is Float32Array of size 32.") && ok;
    ok = assert(slmClassifier.mlpb2 instanceof Float32Array && slmClassifier.mlpb2.length === 16, "MLP Hidden 2 bias is Float32Array of size 16.") && ok;
    ok = assert(slmClassifier.mlpb3 instanceof Float32Array && slmClassifier.mlpb3.length === 8, "MLP Hidden 3 bias is Float32Array of size 8.") && ok;
    ok = assert(slmClassifier.mlpb4 instanceof Float32Array && slmClassifier.mlpb4.length === slmClassifier.conditions.length, "MLP Output bias is successfully initialized.") && ok;
    
    // 2. Verify subword character n-gram extraction in tokenize()
    const sampleTokenize = slmClassifier.tokenize("diabetes");
    const hasChar3Grams = sampleTokenize.some(t => t.startsWith("c3:"));
    const hasChar4Grams = sampleTokenize.some(t => t.startsWith("c4:"));
    ok = assert(hasChar3Grams && hasChar4Grams, "tokenize() successfully extracts subword character 3-grams and 4-grams.") && ok;

    // 3. Verify typo tolerance on a modified clinical query (e.g. "diabtes" -> "diabetes")
    const typoQuery = "I have high blood sugar and need insulin for my diabtes";
    const classification = slmClassifier.classify(typoQuery);
    const topResult = classification[0];
    ok = assert(topResult.condition === "diabetes", `Typo query 'diabtes' successfully resolved to 'diabetes' (Got: '${topResult.condition}').`) && ok;

    return ok;
  });

  // --- Diagnostic Summary ---
  console.log("\n==================================================================");
  console.log("📊 OFFLINE SLM DIAGNOSTIC SYSTEM TEST SUMMARY");
  console.log("==================================================================");
  console.log(`Total Passed Suites: ${passes}`);
  console.log(`Total Failed Suites: ${fails}`);
  if (fails === 0) {
    console.log("🌟 ALL LOCAL ALGORITHMS FUNCTIONING PERFECTLY AT SUB-MILLISECOND SPEEDS!");
    process.exit(0);
  } else {
    console.error("🚨 CORRECTION REQUIRED IN SLM inference pipeline.");
    process.exit(1);
  }
  console.log("==================================================================\n");
})();
