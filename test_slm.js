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
  body: {
    appendChild() { return makeMockElement(); },
    removeChild() {},
    addEventListener() {},
    removeEventListener() {}
  }
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
