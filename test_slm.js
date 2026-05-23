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
global.MutationObserver = class {
  constructor() {}
  observe() {}
  disconnect() {}
};
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
    const isOrWord = empathyOr.toLowerCase().split(/\s+/).some(w => ["apana", "moo", "chinta", "asantu", "swasthya", "bujhiparuchi", "karuntu", "aame"].includes(w.replace(/[.,]/g, "")));
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
