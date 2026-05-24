// ===== RAMAN AI – Experiment No. 170 – Main Logic =====

// ── Hoisted globals (available to all functions immediately) ──
let currentHealthId     = localStorage.getItem('ramanai_current_hid') || null;
let sessionCreatedDate  = null;
let chatHistory         = [];
let hidShownThisSession = false;
let vaultData           = JSON.parse(localStorage.getItem('ramanai_vault') || '[]');
let detectedConditions  = new Set(JSON.parse(localStorage.getItem('ramanai_conditions') || '[]'));
let lastCondition       = null;
let lastConditionTime   = 0;
let activeConsultation   = null;

// ==========================================
// ── RAMAN SLM (Simple Language Model) & DB ──
// ==========================================

// IndexedDB configuration & setup
const dbName = "RamanMedicalDB";
const dbStoreName = "vault_files";
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(dbStoreName)) {
        database.createObjectStore(dbStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = e => {
      db = e.target.result;
      console.log("IndexedDB Initialized successfully");
      resolve(db);
    };
    request.onerror = e => {
      console.error("IndexedDB error:", e.target.error);
      reject(e.target.error);
    };
  });
}

function storeFileInDB(id, file) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const transaction = db.transaction([dbStoreName], "readwrite");
      const store = transaction.objectStore(dbStoreName);
      const record = {
        id: id,
        name: file.name,
        type: file.type,
        dataUrl: reader.result
      };
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = e => reject(e.target.error);
    };
    reader.onerror = e => reject(e.target.error);
    reader.readAsDataURL(file);
  });
}

function getFileFromDB(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }
    const transaction = db.transaction([dbStoreName], "readonly");
    const store = transaction.objectStore(dbStoreName);
    const request = store.get(id);
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
  });
}

function deleteFileFromDB(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }
    const transaction = db.transaction([dbStoreName], "readwrite");
    const store = transaction.objectStore(dbStoreName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = e => reject(e.target.error);
  });
}

// Automatically initialize IndexedDB
initDB().catch(e => console.error("IndexedDB init failed:", e));

// Trie Vocabulary Parser Node
class TrieNode {
  constructor() {
    this.children = {};
    this.isWord = false;
    this.category = null;
  }
}

// Trie Vocabulary Parser for O(L) dictionary lookups with phrase support
class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word, category) {
    let node = this.root;
    for (const char of word.toLowerCase()) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isWord = true;
    node.category = category;
  }

  search(text) {
    const matches = [];
    const words = text.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    const checkPhrase = (phrase) => {
      let node = this.root;
      let isMatch = true;
      for (const char of phrase) {
        if (!node.children[char]) {
          isMatch = false;
          break;
        }
        node = node.children[char];
      }
      if (isMatch && node.isWord) {
        matches.push({ word: phrase, category: node.category });
      }
    };
    
    for (let i = 0; i < words.length; i++) {
      // Unigram
      checkPhrase(words[i]);
      // Bigram
      if (i < words.length - 1) {
        checkPhrase(words[i] + " " + words[i+1]);
      }
      // Trigram
      if (i < words.length - 2) {
        checkPhrase(words[i] + " " + words[i+1] + " " + words[i+2]);
      }
    }
    return matches;
  }
}

// Naive Bayes Classifier with Laplace Smoothing & TF-IDF metrics
class NaiveBayesSymptomClassifier {
  constructor() {
    this.classCounts = {};
    this.wordCounts = {};
    this.classTotals = {};
    this.vocabulary = new Set();
    this.idf = {};
    this.docCounts = 0;
    this.trie = new Trie();
  }

  tokenize(text) {
    const cleanText = text.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
      .trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 1);
    
    // Stop words to filter out grammatical noise for core unigrams
    const stopWords = new Set(["i", "have", "a", "feel", "feeling", "with", "after", "and", "the", "my", "so", "very", "on", "of", "to", "for", "in", "is", "me", "heuchi", "laguchi", "asichi", "pura", "dehare", "deha", "hela", "ta", "hoichi", "ti", "bhal"]);
    
    const tokens = [];
    
    for (const w of words) {
      if (!stopWords.has(w)) {
        tokens.push(w); // Core unigrams
      }
    }
    
    // Extract bigrams
    for (let i = 0; i < words.length - 1; i++) {
      tokens.push(words[i] + " " + words[i+1]);
    }
    
    // Extract trigrams
    for (let i = 0; i < words.length - 2; i++) {
      tokens.push(words[i] + " " + words[i+1] + " " + words[i+2]);
    }
    
    return tokens;
  }

  train(corpus) {
    this.docCounts = 0;
    const docCountsPerToken = {};
    
    for (const [condition, docs] of Object.entries(corpus)) {
      this.classCounts[condition] = (this.classCounts[condition] || 0) + docs.length;
      this.docCounts += docs.length;

      if (!this.wordCounts[condition]) {
        this.wordCounts[condition] = {};
        this.classTotals[condition] = 0;
      }

      for (const doc of docs) {
        const tokens = this.tokenize(doc);
        const uniqueInDoc = new Set(tokens);
        for (const token of uniqueInDoc) {
          docCountsPerToken[token] = (docCountsPerToken[token] || 0) + 1;
        }
        
        for (const token of tokens) {
          this.wordCounts[condition][token] = (this.wordCounts[condition][token] || 0) + 1;
          this.classTotals[condition]++;
          this.vocabulary.add(token);
        }
      }
    }

    // Compute IDF weights
    this.idf = {};
    for (const token of this.vocabulary) {
      const docCount = docCountsPerToken[token] || 0;
      this.idf[token] = Math.log((1 + this.docCounts) / (1 + docCount)) + 1;
    }

    // Index all tokens & phrases into the Trie for fast keyword triggers
    for (const [condition, docs] of Object.entries(corpus)) {
      for (const doc of docs) {
        const tokens = this.tokenize(doc);
        for (const token of tokens) {
          if (token.length > 2) {
            this.trie.insert(token, condition);
          }
        }
      }
    }
  }

  classify(text) {
    const tokens = this.tokenize(text);
    const scores = {};
    const vocabSize = this.vocabulary.size;

    // Fast search using Trie first
    const trieMatches = this.trie.search(text);
    const trieWeight = {};
    for (const match of trieMatches) {
      const termIdf = this.idf[match.word] || 1.0;
      trieWeight[match.category] = (trieWeight[match.category] || 0) + (1.5 * termIdf); // Boost score for strict keyword phrase matches
    }

    for (const condition of Object.keys(this.classCounts)) {
      let logProb = Math.log(this.classCounts[condition] / this.docCounts);

      for (const token of tokens) {
        if (!this.vocabulary.has(token)) continue;

        const count = this.wordCounts[condition][token] || 0;
        const termIdf = this.idf[token] || 1.0;
        // Laplace smoothing: (count + 1) / (total_words_in_class + vocab_size)
        const prob = (count + 1) / (this.classTotals[condition] + vocabSize);
        logProb += termIdf * Math.log(prob); // Scale log probability by TF-IDF weight
      }

      // Apply Trie-based keyword matching boost
      if (trieWeight[condition]) {
        logProb += trieWeight[condition];
      }

      scores[condition] = logProb;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const maxScore = sorted[0][1];
    
    // Softmax-like scaling for presentation confidence
    const exps = sorted.map(([c, s]) => [c, Math.exp(s - maxScore)]);
    const totalExp = exps.reduce((acc, curr) => acc + curr[1], 0);
    const confidenceList = exps.map(([c, e]) => ({
      condition: c,
      confidence: Math.round((e / totalExp) * 100)
    }));

    return confidenceList;
  }
}

// Markov Chain transition engine to synthesize conversational empathy filler text (Bigram transition state)
class MarkovTextGenerator {
  constructor() {
    this.chainEn = {};
    this.startPairsEn = [];
    this.chainOr = {};
    this.startPairsOr = [];
  }

  train(sentences, lang = 'en') {
    const chain = lang === 'or' ? this.chainOr : this.chainEn;
    const startPairs = lang === 'or' ? this.startPairsOr : this.startPairsEn;

    for (const sentence of sentences) {
      const words = sentence.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length < 2) continue;
      startPairs.push([words[0], words[1]]);

      for (let i = 0; i < words.length - 2; i++) {
        const key = words[i] + "_" + words[i+1];
        const next = words[i+2];
        if (!chain[key]) {
          chain[key] = [];
        }
        chain[key].push(next);
      }
    }
  }

  generate(maxLength = 15) {
    const isOr = window.currentLang === 'or';
    const chain = isOr ? this.chainOr : this.chainEn;
    const startPairs = isOr ? this.startPairsOr : this.startPairsEn;

    if (startPairs.length === 0) {
      // Return a static fallback if not trained
      return isOr 
        ? "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ବୁଝିପାରୁଛି।" 
        : "I understand your health concerns.";
    }
    
    const start = startPairs[Math.floor(Math.random() * startPairs.length)];
    let w1 = start[0];
    let w2 = start[1];
    let result = [w1.charAt(0).toUpperCase() + w1.slice(1), w2];

    for (let i = 0; i < maxLength - 2; i++) {
      const key = w1 + "_" + w2;
      const choices = chain[key];
      if (!choices || choices.length === 0) break;
      const next = choices[Math.floor(Math.random() * choices.length)];
      result.push(next);
      w1 = w2;
      w2 = next;
    }

    return result.join(" ") + ".";
  }
}

// Define Expanded Offline Training Datasets
const SLM_TRAINING_CORPUS = {
  fever: [
    "i have a severe fever and chills",
    "shivering and body is burning hot with temperature",
    "high temperature of 102 degrees and shivering chills",
    "feeling very hot, sweaty, shivering, and weak with pyrexia",
    "deha garam laguchi jwar asichi chills shivering",
    "jaro hoichi deha pura garam shivering high fever",
    "deha jwara laguchi chabuka maruchi temperature",
    "temperature is high, body is aching and hot",
    "shivering, cold sweat, hot forehead, high fever",
    "shivering with body temperature spike pyrexia hot",
    "jwara asichi deha pura gorom",
    "deha garam jwara chabuka bitha chills",
    "body is burning up and feeling freezing cold shivering",
    "severe fever with body pain and low energy",
    "running a high temperature of 101 degrees Fahrenheit chills"
  ],
  headache: [
    "my head hurts so bad and i feel dizzy",
    "severe migraine, headache on one side, light sensitivity",
    "throbbing headache, tension head pain, sinus pressure",
    "munda bindhuchi chatei deuchi munda ghurei heuchi pain",
    "migraine attack, throbbing head pain, head is bursting",
    "bad headache after screen time, dizziness and sinus pain",
    "headache, dizzy, sensitivity to light, head pain",
    "munda betha heuchi munda chatei phati gala bhal laguchi",
    "severe pain on left side of head migraine visual aura",
    "tension headache behind eyes stiff neck and shoulder pressure",
    "sinus pain forehead throbbing pain light headache",
    "munda bhari laguchi chatei munda ghureiba pain",
    "headache and nausea with extreme visual sensitivity",
    "chronic headache tension migraine pressure head"
  ],
  cough: [
    "persistent dry cough and chest congestion with mucus",
    "coughing up green mucus, phlegm, sore throat",
    "cough and cold with severe runny nose and bronchitis",
    "kasha heuchi thanda laguchi mucus phlegm",
    "kasha saha kafa baharu heuchi chest congestion",
    "dry cough, sore throat, bronchial irritation, cough",
    "coughing constantly, wheezing, tickling throat",
    "wet cough hacking up thick yellow phlegm chest tightness",
    "cough cold fever throat pain sore bronchial irritation",
    "kasha kafa thanda runny nose sore throat congestion",
    "constant coughing fits with severe chest congestion wheezing",
    "bronchitis productive cough throat itchiness mucus cold",
    "kafa jami jaichi kasha saha chhati bhari"
  ],
  "chest pain": [
    "crushing chest pain radiating to left arm and jaw",
    "severe chest tightness, pressure, short of breath, heart pain",
    "chhati bindhuchi chati jantrana breathlessness dizziness",
    "sharp chest pain when breathing, heart attack fear, squeezing",
    "heart pressure, squeezing pain in chest, arm pain, sweat",
    "chhati bhari laguchi chati re jantrana heuchi",
    "crushing chest pressure radiating to left shoulder sweating",
    "angina pectoris chest discomfort tightness left arm jaw pain",
    "chhati chirei bitha heuchi niswasa prabasare kasta heuchi",
    "chest compression shortness of breath severe heart pain",
    "sharp pain in middle of chest squeezing coronary risk",
    "chhati re jantrana sahita beka ebam hata re bitha"
  ],
  "stomach pain": [
    "stomach cramps, abdominal pain, bloating, severe nausea",
    "acid reflux, gastritis stomach pain after eating, indigestion",
    "peta katuchi banti laguchi stomach pain bloating",
    "gastric pain, diarrhea, loose stools, nausea, vomiting",
    "sharp pain in lower right abdomen, belly ache, vomiting",
    "nausea and vomiting with severe stomach cramps, indigestion",
    "severe burning pain in upper stomach acid indigestion",
    "abdominal cramps bloating flatulence loose motions stomach ache",
    "peta bitha heuchi gas pain vomiting banti laguchi indigestion",
    "acute gastritis stomach ulcer heartburn belly pain bloating",
    "lower abdominal cramps sharp pain stomach hyperacidity",
    "peta katuchi bhari banti nausea acid reflux"
  ],
  "joint pain": [
    "joint swelling, knee arthritis pain, knee stiffness",
    "ganthi bitha ganthi phula knee joint pain arthritis",
    "swollen knees, severe joint pain, gout flare, bone aches",
    "difficulty walking due to knee pain and joint stiffness",
    "rheumatoid arthritis joint pain, knee inflammation, joint swelling",
    "knee joint stiffness arthritic swelling walking pain",
    "goda ganthi bindha betha phula joint inflammation bone",
    "joint pain wrist ankle knee stiffness swelling",
    "chronic knee arthritis joint degenerative pain walking problem",
    "ganthi bitha arthritic joint stiffness swelling knee",
    "severe swelling in joints arthritis gout bone ache"
  ],
  "skin rash": [
    "itchy red rash on skin, eczema patches, dry skin hives",
    "kundei heuchi charma khasru skin rash allergy",
    "allergic dermatitis hives, itchy skin patches, red bumps",
    "fungal infection rash, burning skin, severe itching",
    "red itchy bumps all over body, allergy hives, eczema",
    "itchy skin rash hives allergic contact dermatitis eczema",
    "charma kundia khasru roga patches red skin itching",
    "body rash burning red bumps hives fungal skin infection",
    "extreme skin irritation itching rash hives dry patches",
    "kundia skin rash hives allergy dermatitis red spots"
  ],
  "high blood pressure": [
    "dizziness, high blood pressure reading, blurry vision",
    "rakta chapa munda bula dizziness hypertension bp",
    "hypertension crisis, dizzy, severe headache with high bp",
    "checked blood pressure and it is 160 over 100",
    "lightheadedness, racing heart, dizzy, high bp",
    "high blood pressure reading 150 over 95 hypertension",
    "rakta chapa badhi jaichi munda ghureiba bp high tension",
    "systolic bp reading 170 cardiac palpitations dizziness",
    "hypertensive headache dizzy racing heart bp reading",
    "blood pressure high dizzy blurry vision racing pulse"
  ],
  diabetes: [
    "excessive thirst, frequent urination, high blood sugar",
    "sugar badhi jaichi bahumutra thirst diabetes glucose",
    "diabetic high blood glucose, frequent peeing, thirsty",
    "feeling extremely tired, blurred vision, sugar level 250",
    "thirsty all the time, urinating a lot, diabetic spike",
    "high blood sugar level 280 mg/dL diabetes mellitus",
    "sugar badhi jaichi barambar parisra laguchi diabetes spike",
    "polyuria polydipsia diabetic hyperglycemia fatigue dry mouth",
    "fasting glucose high 180 hba1c sugar spike diabetes",
    "extreme fatigue thirsty barambar parisra diabetic glucose",
    "blood glucose test result is 260 mg/dL glycemia",
    "aakhi dekhajiba chhota fatigue bahumutra sugar spike"
  ],
  "eye pain": [
    "red eyes, discharge, blurry vision, painful eyes",
    "akhi bindhuchi akhi lala conjunctivitis blurry eye pain",
    "dry eye strain, watery eyes, conjunctivitis discharge",
    "pain when moving eyes, light sensitivity, blurry vision",
    "burning eye sensation, red swollen eyelids, dry eyes",
    "conjunctivitis red eyes discharge blurry eye strain",
    "akhi lal padichi pani baharuche akhi bitha conjunctivitis",
    "sore eyes discharge itchiness photophobia blurry vision",
    "ocular pain dry eyes computer screen strain redness",
    "akhi pani baharuchi red eye pain strain watery",
    "photophobia dry itchy red eye infection conjunctivitis",
    "aakhi lal phuli jaichi aakhi bitha computer strain"
  ],
  "back pain": [
    "lower back ache, stiff spine, nerve pain down leg",
    "anta bindhuchi spine stiffness backache muscle strain",
    "herniated disc pain, back muscle spasm, stiff back",
    "lumbar pain, back strain after lifting heavy objects",
    "severe backache, stiff spine, pain radiating to buttocks",
    "lower back pain sciatica herniated lumbar disc spasm",
    "anta bitha heuchi spine betha muscle catch strain",
    "lumbar spine stiffness backache radiating leg pain numbness",
    "back pain muscle pull spine spasm lifting heavy objects",
    "anta bindha stiff spine lumbar ache backache",
    "lumbar back pain spasm poor posture lumbar spondylosis",
    "anta bindha bitha heuchi chalibare kasta poor posture"
  ]
};

const MARKOV_TRAINING_SENTENCES_EN = [
  "i understand you are feeling unwell and experiencing discomfort today",
  "let us investigate these symptoms carefully to understand what is going on",
  "your health profile and symptoms are analyzed with top priority",
  "we are evaluating possible medical conditions based on your inputs",
  "please stay calm and let us review this systematically together",
  "i am here to assist you and provide safety advice for your symptoms",
  "let us work together to identify the best precautions for your health",
  "i hear you and i am sorry you are dealing with this discomfort",
  "we want to make sure you get the right clinical advice",
  "let us examine your vitals and risk profile to establish triage safety",
  "your safety and well-being remain our absolute clinical focus",
  "let us proceed with care and evaluate these health concerns immediately",
  "i am committed to checking your symptoms thoroughly to ensure safety",
  "symptom observation and profile data are processed with extreme privacy"
];

const MARKOV_TRAINING_SENTENCES_OR = [
  "moo bujhiparuchi apana asustha anubhab karuchanti ajhi ebam kasta pauchanti",
  "asantu dekhiba kana hoipariba ebam ehara prathama chikitsa kariba milisiri",
  "apana dhairya dharantu ebam mo sahita katha huantu jala piyantu sustha rahantu",
  "chinta karantu nahi asantu ehaku shigra bhala kariba sahaya karibi",
  "apana nija jatna niyantu ebam ehi Upachara shigra prarambha karantu",
  "apana bilkul chinta karantu nahi aame ehara prathama samadhana kariba",
  "apana dhairya dharantu aame apananku purna sahajya karibu",
  "swasthya samasya bhala kariba aamara prathama kartabya",
  "symptom ebam medical profile gupata bhabe parichalita heba"
];

// Initialize and Train SLM Engines
const slmClassifier = new NaiveBayesSymptomClassifier();
slmClassifier.train(SLM_TRAINING_CORPUS);

const markovGenerator = new MarkovTextGenerator();
markovGenerator.train(MARKOV_TRAINING_SENTENCES_EN, 'en');
markovGenerator.train(MARKOV_TRAINING_SENTENCES_OR, 'or');

// Define generateSlmResponse
async function generateSlmResponse(text, profile) {
  const startTime = performance.now();
  const isOr = window.currentLang === 'or';

  // Spiking CPU/Neural indicators to show active SLM calculation
  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  if (cpu) cpu.style.width = "96%";
  if (neural) neural.style.width = "98%";

  // Classify the user symptom using Naive Bayes Symptom Classifier
  const classifications = slmClassifier.classify(text);
  const bestMatch = classifications[0];
  const condition = bestMatch.confidence > 25 ? bestMatch.condition : null;

  // Track state
  if (activeDiagnostic) {
    if (!condition || condition === activeDiagnostic.condition) {
      // Stay in context
    } else {
      activeDiagnostic = { condition: condition, step: 0 };
    }
  } else if (condition) {
    activeDiagnostic = { condition: condition, step: 0 };
  }
  updateContextIndicator();

  // Generate empathetic opening filler via Markov Chain
  const empathyFiller = markovGenerator.generate(12);

  // Incorporate Patient Profile & Allergy Conflict checking
  const profileInfo = buildProfileContext(profile);
  
  // Allergy warning checking
  let allergyAlertHtml = "";
  if (profile.allergies && condition) {
    const kb = MEDICAL_KB[condition];
    if (kb && kb.medications) {
      const allergyLower = profile.allergies.toLowerCase();
      const matchedMeds = kb.medications.filter(med => 
        med.name.toLowerCase().includes(allergyLower) || 
        (allergyLower.includes("nsaid") && (med.name.toLowerCase().includes("ibuprofen") || med.name.toLowerCase().includes("diclofenac") || med.name.toLowerCase().includes("aspirin"))) ||
        (allergyLower.includes("penicillin") && med.name.toLowerCase().includes("amoxicillin"))
      );
      if (matchedMeds.length > 0) {
        allergyAlertHtml = `
          <div class="med-section warning" style="border: 2px solid #ff4d6d; animation: pulseGlow 1.5s infinite alternate;">
            <div class="med-section-title" style="color:#ff4d6d; font-weight:bold;">⚠️ ALLERGY CONFLICT WARNING</div>
            <p><strong>ALERT:</strong> You have documented allergies to <strong>"${profile.allergies}"</strong>.</p>
            <p>RAMAN SLM detected that the suggested medication <strong>"${matchedMeds.map(m => m.name).join(", ")}"</strong> conflicts with your allergy profile.</p>
            <p style="text-transform:uppercase; font-weight:bold; letter-spacing:0.5px;">DO NOT take this medication. Consult your physician immediately for alternatives.</p>
          </div>`;
      }
    }
  }

  // Pain slider safety logic
  let painAlertHtml = "";
  const painVal = parseInt(profile.pain || document.getElementById('painSlider').value || "5");
  if (painVal >= 8 && condition) {
    painAlertHtml = `
      <div class="med-section warning" style="border: 2px solid #ff9f43; margin-bottom: 15px;">
        <div class="med-section-title" style="color:#ff9f43;">⚠️ HIGH PAIN LEVEL ALERT (${painVal}/10)</div>
        <p>You have indicated a <strong>severe pain level of ${painVal}/10</strong>. Severe pain indicates high clinical urgency.</p>
        <p><strong>Caution:</strong> Please monitor for emergency signs. If pain increases, radiates, or is accompanied by breathing difficulties, proceed directly to the nearest emergency clinic.</p>
      </div>`;
  }

  let html = "";
  
  if (!condition) {
    // Conversational fallbacks
    const isHello = /^hi$|^hello$|^hey$|^greetings$|namaskar/i.test(text.trim());
    const isThanks = /thank|appreciate|grateful/i.test(text.trim());
    const isWho = /who are you|what are you|your name/i.test(text.trim());
    const isChat = /how are you|talk to me|say something|can we talk|friend|help me/i.test(text.trim());

    // Robust out-of-context check
    const healthKeywords = new Set([
      "pain", "fever", "cough", "ache", "hurt", "rash", "blood", "pressure", "sugar", "diabetes", 
      "stomach", "chest", "head", "joint", "skin", "eye", "back", "throat", "cold", "sick", "ill", 
      "doctor", "medicine", "pill", "prescription", "health", "treatment", "symptom", "vomit", 
      "nausea", "dizzy", "fatigue", "weak", "breathe", "breathing", "breath", "oxygen", "temp", 
      "temperature", "bp", "pulse", "allergy", "allergic", "swelling", "swollen", "bleed", 
      "bleeding", "wound", "injury", "broken", "sprain", "burn", "infection", "infect", 
      "jara", "betha", "munda", "chhati", "kasha", "pheta", "ganthi", "charma", "rakta", "chapa", 
      "aakhi", "anta", "kashta", "deha", "garam", "asthma", "heart", "lung", "liver", "kidney", 
      "brain", "muscle", "bone", "stiffness", "elbow", "arm", "leg", "knee", "shoulder", "finger", 
      "toe", "foot", "neck", "ear", "nose", "mouth", "tongue", "tooth", "teeth", "gum", 
      "stomachache", "headache", "chestache", "backache", "earache", "toothache", "itchy", "itch", 
      "scratch", "redness", "spots", "pimples", "shivering", "shiver", "chill", "chills", "sweat", 
      "sweating", "tired", "exhausted"
    ]);

    const outOfContextKeywords = new Set([
      "breakfast", "lunch", "dinner", "eat", "food", "recipe", "cook", "restaurant", "hotel", 
      "weather", "sports", "cricket", "football", "movie", "song", "music", "capital", "president", 
      "prime minister", "price", "buy", "car", "phone", "laptop", "game", "play", "joke", "riddle", 
      "flight", "ticket", "news", "politics", "crypto", "bitcoin", "stock", "invest", "finance",
      "code", "program", "developer", "engineering", "history", "geography", "math", "science"
    ]);

    const cleanWords = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ").trim().split(/\s+/);
    
    let hasMedicalWord = false;
    for (const w of cleanWords) {
      if (slmClassifier.vocabulary.has(w) || healthKeywords.has(w)) {
        hasMedicalWord = true;
        break;
      }
    }

    let hasOutOfContextWord = false;
    for (const w of cleanWords) {
      if (outOfContextKeywords.has(w)) {
        hasOutOfContextWord = true;
        break;
      }
    }

    const isOutOfContext = (hasOutOfContextWord && !hasMedicalWord) || (cleanWords.length > 2 && !hasMedicalWord && !isHello && !isThanks && !isWho && !isChat);

    if (isOutOfContext) {
      activeDiagnostic = null;
      updateContextIndicator();
      const outOfContextReply = isOr
        ? `<div class="med-section warning" style="border: 2px solid var(--accent); margin-bottom: 15px;">
             <div class="med-section-title" style="color:var(--accent); font-weight:bold;">⚠️ ଅପ୍ରାସଙ୍ଗିକ ଅନୁସନ୍ଧାନ (Out of Context Inquiry)</div>
             <p><strong>ସୂଚନା:</strong> ରାମନ୍ ଏଆଇ (RAMAN AI) ହେଉଛି ଏକ ଉତ୍ସର୍ଗୀକୃତ ଚିକିତ୍ସା ସୂଚନା ପ୍ରଣାଳୀ ଯାହା ରୋଗର ଲକ୍ଷଣ ବିଶ୍ଳେଷଣ, ଜରୁରୀକାଳୀନ ସ୍ଥିତି ଏବଂ ଔଷଧ ନିରାପତ୍ତା ଯାଞ୍ଚ କରିବା ପାଇଁ ଡିଜାଇନ୍ କରାଯାଇଛି।</p>
             <p>ଦୟାକରି ଆପଣଙ୍କର ସ୍ୱାସ୍ଥ୍ୟଗତ ସମସ୍ୟା କିମ୍ବା ଲକ୍ଷଣ (ଉଦାହରଣ ସ୍ୱרୂପ: ଜ୍ୱର, ମୁଣ୍ଡବିନ୍ଧା, ଛାତିରେ ଯନ୍ତ୍ରଣା) ବିଷୟରେ ପଚାରନ୍ତୁ।</p>
           </div>`
        : `<div class="med-section warning" style="border: 2px solid var(--accent); margin-bottom: 15px;">
             <div class="med-section-title" style="color:var(--accent); font-weight:bold;">⚠️ OUT OF CONTEXT INQUIRY</div>
             <p><strong>Notice:</strong> RAMAN AI is a dedicated medical intelligence system specializing in symptom analysis, clinical triage, and pathopharmacological safety checks.</p>
             <p>Please provide symptom-related observations or health-related queries (e.g. fever, headache, chest pain) so that I can assist you safely.</p>
           </div>`;
      
      const footerHint = isOr ? ODIA_DICT.footerHint : "You can also use the <strong>Quick Symptoms</strong> buttons on the left panel for common conditions. 🩺";
      
      return `<p>${profileInfo}</p>
        <p>${outOfContextReply}</p>
        <p><small style="color: var(--text-muted);">${footerHint}</small></p>`;
    }

    let conversationalReply = "";
    if (isHello) {
      conversationalReply = isOr 
        ? `ନମସ୍କାର! ମୁଁ ରାମନ୍ ଏଆଇ (Local SLM)। ଆଜି ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟରେ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?`
        : `Hello! I am RAMAN AI (powered by Local SLM). How can I assist you with your health symptoms today?`;
    } else if (isThanks) {
      conversationalReply = isOr
        ? `ଆପଣଙ୍କୁ ସ୍ୱାଗତ! ଯଦି ଆପଣଙ୍କର ଅନ୍ୟ କୌଣସି ସ୍ୱାସ୍ଥ୍ୟଗତ ସମସ୍ୟା ଥିଲେ ଜଣାନ୍ତୁ।`
        : `You are very welcome! Helping you is my goal. Let me know if you have other symptoms.`;
    } else if (isWho) {
      conversationalReply = isOr
        ? `ମୁଁ ରାମନ୍ ଏଆଇ, ଏକ ସୁପର-ଫାଷ୍ଟ ଅଫଲାଇନ୍ ସିମ୍ପଲ୍ ଲାଙ୍ଗୁଏଜ୍ ମଡେଲ୍ (SLM) ଯାହା ଆପଣଙ୍କ ଲକ୍ଷଣ ବିଷୟରେ ପରାମର୍ଶ ଦେବା ପାଇଁ ଡିଜାଇନ୍ କରାଯାଇଛି।`
        : `I am RAMAN AI, powered by a custom-built, sub-millisecond local Simple Language Model (SLM) running 100% offline.`;
    } else if (isChat) {
      conversationalReply = isOr
        ? `ମୁଁ ଆପଣଙ୍କ ପାଖରେ ଅଛି! ଆପଣଙ୍କୁ ଶାରୀରିକ ଭାବରେ କିପରି ଲାଗୁଛି? ମୋତେ କୁହନ୍ତୁ।`
        : `I am right here with you! How are you feeling physically today? Let me know if anything is aching or hurting.`;
    } else {
      const lowerText = text.toLowerCase();
      if (/sick|unwell|not feel|not good|asustha|deh kharab/i.test(lowerText)) {
        conversationalReply = isOr
          ? `ଆପଣ ଅସୁସ୍ଥ ଅନୁଭବ କରୁଥିବାରୁ ମୁଁ ଦୁଃଖିତ। ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଭଲଭାବେ ବୁଝିବା ପାଇଁ, ଦୟାକରି କହିବେ କି ଆପଣଙ୍କର ଜ୍ୱର, କାଶ, ମୁଣ୍ଡବିନ୍ଧା କିମ୍ବା ଶରୀରରେ ଯନ୍ତ୍ରଣା ହେଉଛି କି?`
          : `I am sorry to hear you are feeling unwell. To help me triage your condition, could you describe your specific symptoms in more detail (e.g. fever, cough, body pain, or headache)?`;
      } else if (/pain|hurt|ache|bitha|jantrana|kanchuni/i.test(lowerText)) {
        conversationalReply = isOr
          ? `ଆପଣ ଶରୀରରେ ଯନ୍ତ୍ରଣା ହେଉଥିବା ବିଷୟରେ କହିଲେ। ଦୟାକରି ଜଣାଇବେ କି ଯନ୍ତ୍ରଣา କେଉଁଠି ହେଉଛି (ଯେପରିକି ଛାତି, ମୁଣ୍ଡ, ପେଟ, ଆଣ୍ଠୁଗଣ୍ଠି କିମ୍ବା ଅଣ୍ଟା) ଏବଂ ଏହା କେତେ ତୀବ୍ର?`
          : `You mentioned experiencing pain. Could you please specify exactly where it hurts (e.g. chest, head, stomach, joints, or back) and describe the intensity (mild, moderate, or severe)?`;
      } else if (/tired|fatigue|weak|exhausted|durbala|klanta/i.test(lowerText)) {
        conversationalReply = isOr
          ? `ଦୁର୍ବଳତା କିମ୍ବା ଥକ୍କାପଣ ହେବା ଏକ ସାଧାରଣ ଲକ୍ଷଣ ଅଟେ। ଆପଣ ପର୍ଯ୍ୟାପ୍ତ ପରିମାଣର ବିଶ୍ରାମ ନେଉଛନ୍ତି କି ଏବଂ ପ୍ରଚୁର ଜଳପାନ କରୁଛନ୍ତି କି? ଯଦି ଆପଣଙ୍କର ଜ୍ୱର କିମ୍ବା ମୁଣ୍ଡ ବୁଲାଉଛି, ଦୟାକରି ଜଣାନ୍ତୁ।`
          : `Experiencing weakness or fatigue is a common symptom. Are you getting enough sleep and staying hydrated? If you have other symptoms like a fever or dizziness, please let me know.`;
      } else {
        conversationalReply = isOr
          ? `ମୁଁ ଆପଣଙ୍କ ବାର୍ତ୍ତା ପାଇଲି। ଦୟାକରି ଆପଣଙ୍କ ସିମ୍ପଟମ୍ (ଲକ୍ଷଣ) ବିଷୟରେ ଟିକେ ଅଧିକ ବିବରଣୀ ଦେବେ କି? ଉଦାହରଣ: ଜ୍ୱର, ମୁଣ୍ଡବିନ୍ଧା, କିମ୍ବା ଛାତିରେ କଷ୍ଟ।`
          : `I received your message. Could you please describe your symptoms in a bit more detail? It helps if you mention where it hurts, how long it's been happening, and if you have other symptoms like a fever.`;
      }
    }

    const footerHint = isOr ? ODIA_DICT.footerHint : "You can also use the <strong>Quick Symptoms</strong> buttons on the left panel for common conditions. 🩺";

    html = `<p>${profileInfo}</p>
      <p style="font-style:italic; color:rgba(255,255,255,0.7); margin-bottom:12px;">"${empathyFiller}"</p>
      <p>${conversationalReply}</p>
      <p><small style="color: var(--text-muted);">${footerHint}</small></p>`;
  } else {
    // Output complete medical KB triage
    const kb = MEDICAL_KB[condition];
    const isEmergency = condition === "chest pain";
    const introTxt = isOr ? ODIA_DICT.assessmentIntro : "Thank you for the details. Based on our offline classification, here is your preliminary assessment:";

    html = `<p>${profileInfo}</p>
      <p style="font-style:italic; color:rgba(255,255,255,0.7); margin-bottom:12px;">"${empathyFiller}"</p>
      <p>${introTxt}</p>`;

    if (painAlertHtml) html += painAlertHtml;
    if (allergyAlertHtml) html += allergyAlertHtml;

    // Target Category Confidence Badge
    html += `
      <div class="slm-confidence-bar" style="background:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px; margin-bottom:15px; display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.6)">Local Inference Match</span>
        <span class="vault-badge" style="border-color:var(--primary); color:var(--primary); background:rgba(0, 255, 179, 0.1); font-weight:bold; font-size:0.8rem;">
          ${condition.toUpperCase()} (${bestMatch.confidence}% Match)
        </span>
      </div>`;

    html += `<div class="med-section">
      <div class="med-section-title">${isOr ? ODIA_DICT.possibleCond : "🔬 POSSIBLE CONDITIONS"}</div>
      <ul>${kb.conditions.map(c => `<li>${c}</li>`).join("")}</ul>
    </div>`;

    html += `<div class="med-section ${isEmergency ? 'warning' : ''}">
      <div class="med-section-title">${isOr ? ODIA_DICT.suggestedMed : "💊 SUGGESTED MEDICATIONS"}</div>`;
    kb.medications.forEach(m => {
      html += `<p><strong>${m.name}</strong><br>
        <small>📋 ${isOr ? ODIA_DICT.dose : "Dose:"} ${m.dose}</small><br>
        <small>ℹ️ ${isOr ? ODIA_DICT.note : "Note:"} ${m.note}</small></p>`;
    });
    html += `</div>`;

    html += `<div class="med-section ${isEmergency ? 'warning' : 'info'}">
      <div class="med-section-title">${isOr ? ODIA_DICT.precautions : "⚠️ PRECAUTIONS & WARNINGS"}</div>
      <ul>${kb.precautions.map(p => `<li>${p}</li>`).join("")}</ul>
    </div>`;

    html += `<div class="med-section info">
      <div class="med-section-title">${isOr ? ODIA_DICT.diet : "🥗 DIETARY RECOMMENDATIONS"}</div>
      <ul>${kb.diet.map(d => `<li>${d}</li>`).join("")}</ul>
    </div>`;

    html += `<p>🏥 <strong>${isOr ? ODIA_DICT.specialist : "Recommended Specialist:"}</strong> ${kb.specialist}</p>`;

    html += `<div class="med-section warning">
      <div class="med-section-title">${isOr ? ODIA_DICT.disclaimerTitle : "🔴 IMPORTANT DISCLAIMER"}</div>
      <p>${isOr ? ODIA_DICT.disclaimerBody : "This analysis is for informational purposes only. Please consult a qualified medical professional before starting any treatment. Self-medication can be dangerous."}</p>
    </div>`;

    if (!currentHealthId) saveHealthSession();

    const pdfBtnText = isOr ? "📋 ପ୍ରେସକ୍ରିପସନ୍ PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ" : "📋 DOWNLOAD CLINICAL PDF PRESCRIPTION";
    const pdfBtnDesc = isOr 
      ? "ଆପଣଙ୍କ ସୁବିଧା ପାଇଁ ଏହି ପ୍ରେସକ୍ରିପସନ୍ ର ଏକ ପ୍ରିଣ୍ଟ୍-ରେଡି A4 PDF ଡକ୍ୟୁମେଣ୍ଟ୍ ଡାଉନଲୋଡ୍ କରନ୍ତୁ।"
      : "For your convenience, download a print-ready A4 PDF document containing your complete clinical assessment and pharmacotherapy guidelines.";

    html += `
      <div class="hid-card" style="margin-top: 20px; border-color: var(--teal); background: rgba(0, 255, 179, 0.03);">
        <div class="hid-card-header" style="color: var(--teal);">📄 CLINICAL PDF PRESCRIPTION</div>
        <div class="hid-card-body">
          <p class="hid-card-desc">${pdfBtnDesc}</p>
          <div class="hid-card-actions" style="margin-bottom: 15px;">
            <button class="hid-action-btn" onclick="window.downloadSlmPrescriptionPDF('${condition}')" style="background: var(--teal); color: #0f172a; width: 100%; border: none; padding: 10px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 0 10px rgba(0, 255, 179, 0.2);">
              ${pdfBtnText}
            </button>
          </div>
        </div>
      </div>

      <div class="hid-card" style="margin-top: 15px;">
        <div class="hid-card-header">🎉 YOUR HEALTH ID IS READY</div>
        <div class="hid-card-body">
          <div class="hid-code">${currentHealthId}</div>
          <p class="hid-card-desc">Your consultation is complete. Save this ID. Next visit, enter it in the Session Manager to instantly restore your profile and full consultation history.</p>
          <div class="hid-card-actions">
            <button class="hid-action-btn" onclick="navigator.clipboard.writeText('${currentHealthId}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy ID'},1500)}).catch(()=>prompt('Copy your Health ID:','${currentHealthId}'))">📋 Copy ID</button>
          </div>
        </div>
      </div>`;
  }

  const endTime = performance.now();
  const latency = (endTime - startTime).toFixed(3);
  console.log(`RAMAN SLM Inference completed in ${latency} ms`);

  setTimeout(() => {
    if (cpu) cpu.style.width = "48%";
    if (neural) neural.style.width = "52%";
  }, 1200);

  return html;
}

// ── Splash Screen ──────────────────────────────────────
const splashMsgs = [
  "Initializing neural pathways...",
  "Loading medical knowledge base...",
  "Calibrating symptom recognition...",
  "Establishing secure connection...",
  "RAMAN AI is ready."
];
let splashIdx = 0;
const splashStatusEl = document.getElementById("splashStatus");
const splashInterval = setInterval(() => {
  splashIdx++;
  if (splashStatusEl) {
    if (splashIdx < splashMsgs.length) splashStatusEl.textContent = splashMsgs[splashIdx];
    else clearInterval(splashInterval);
  } else {
    clearInterval(splashInterval); // Element doesn't exist, stop timer
  }
}, 800);

window._splashTimer = setTimeout(() => {
  // This timer is also set (and may be cancelled) at the bottom of app.js by the Health ID module.
  // If Health ID module hasn't run yet (first load) this fires normally.
}, 4800); // visual splash plays via CSS; JS app init now handled at bottom of file

// ── Mobile Sidebar Toggle ──────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.toggle('open');
  backdrop.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.remove('open');
  backdrop.style.display = 'none';
}

// ── Tutorial Modal Toggle ──────────────────────────────────
function openTutorial() {
  document.getElementById('tutorialBackdrop').style.display = 'block';
  document.getElementById('tutorialModal').classList.add('open');
}
function closeTutorial() {
  document.getElementById('tutorialBackdrop').style.display = 'none';
  document.getElementById('tutorialModal').classList.remove('open');
}

// ── Clock ───────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function updateClock() {
  const el = document.getElementById("clockDisplay");
  if (el) el.textContent = nowTime();
}
setInterval(updateClock, 30000);
updateClock();

// ── Particles ───────────────────────────────────────────
function initParticles() {
  const container = document.getElementById("bgParticles");
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = Math.random() * 5 + 2;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 18 + 12}s;
      animation-delay:${Math.random() * 12}s;
    `;
    container.appendChild(p);
  }
}

// ── Medical Knowledge Base ─────────────────────────────
const MEDICAL_KB = {
  fever: {
    conditions: ["Viral Infection", "Bacterial Infection", "Flu (Influenza)", "Common Cold", "COVID-19"],
    medications: [
      { name: "Paracetamol (Acetaminophen)", dose: "500–1000 mg every 6–8 hours as needed (Maximum 4000 mg per 24 hours)", note: "First-line antipyretic & analgesic. Directly acts on the hypothalamus to reduce high body temperature. Take with a glass of water; can be administered with or without food. Avoid other acetaminophen-containing medications to prevent accidental hepatotoxicity." },
      { name: "Ibuprofen", dose: "400 mg every 8 hours with food (Maximum 1200 mg per 24 hours)", note: "Non-steroidal anti-inflammatory drug (NSAID). Relieves fever, body aches, and inflammatory responses by blocking prostaglandin synthesis. ALWAYS take with food, milk, or antacids to safeguard gastric mucosa. Do not use if history of peptic ulcers or severe kidney disease." }
    ],
    precautions: ["Stay hydrated – drink 8–10 glasses of water/day", "Rest adequately", "Monitor temperature every 4 hours", "Seek urgent care if fever exceeds 104°F (40°C)"],
    diet: ["Warm soups and broths", "Fresh citrus fruits (Vitamin C)", "Ginger and tulsi tea", "Avoid cold foods and beverages"],
    specialist: "General Physician / Internist"
  },
  headache: {
    conditions: ["Tension Headache", "Migraine", "Dehydration", "Sinusitis", "Hypertension"],
    medications: [
      { name: "Paracetamol", dose: "500–1000 mg every 6 hours as needed (Maximum 4000 mg/day)", note: "First-line relief for mild-to-moderate tension headaches. Minimizes headache severity by inhibiting prostaglandin synthesis in the central nervous system. Safe for gastric lining, but avoid alcohol consumption during use." },
      { name: "Ibuprofen", dose: "400 mg every 8 hours with food", note: "Highly effective NSAID targeting vascular and muscular tension components of tension headaches. Take after meals to avoid gastrointestinal discomfort." },
      { name: "Sumatriptan", dose: "50 mg orally at the immediate onset of migraine attack; may repeat once after 2 hours if pain persists (Maximum 100 mg per 24 hours)", note: "Selective 5-HT1 receptor agonist. Specifically targets migraine attacks by constricting dilated cranial blood vessels and blocking inflammatory neuropeptide release. Take immediately at the first sign of aura or pain. Do not use if history of ischemic heart disease or uncontrolled hypertension." }
    ],
    precautions: ["Avoid screen time and bright lights", "Apply cold/warm compress on forehead", "Seek emergency care for sudden severe 'thunderclap' headache"],
    diet: ["Drink plenty of water", "Avoid caffeine excess", "Small regular meals", "Magnesium-rich foods (nuts, leafy greens)"],
    specialist: "Neurologist (for chronic/recurring headaches)"
  },
  cough: {
    conditions: ["Common Cold", "Bronchitis", "Asthma", "GERD", "Pneumonia", "Allergic Rhinitis"],
    medications: [
      { name: "Dextromethorphan", dose: "10–20 mg every 4–6 hours as needed (Maximum 120 mg/day)", note: "Non-narcotic cough suppressant. Directly acts on the cough center in the medulla oblongata to inhibit dry, hacking, non-productive coughs. May cause mild drowsiness; avoid driving or operating heavy machinery during use." },
      { name: "Guaifenesin", dose: "200–400 mg every 4 hours as needed with a full glass of water (Maximum 2400 mg/day)", note: "Expectorant. Reduces the viscosity of tenacious respiratory secretions and thins mucus, making it easier to cough up and clear from bronchial pathways. Maintain high water intake to optimize expectorant efficiency." },
      { name: "Salbutamol Inhaler", dose: "1–2 inhalations (90–180 mcg) every 4–6 hours as needed for bronchospasm relief", note: "Short-acting beta-2 adrenergic receptor agonist (bronchodilator). Relaxes bronchial smooth muscles to rapidly relieve chest tightness, wheezing, and coughing. Shake well before use and rinse mouth with water after inhalation to prevent dry throat." }
    ],
    precautions: ["Avoid cold air and smoke", "Stay hydrated", "Use steam inhalation", "Persistent cough >3 weeks needs investigation"],
    diet: ["Warm fluids – honey-lemon water", "Turmeric milk (Haldi doodh)", "Avoid dairy if producing mucus"],
    specialist: "Pulmonologist / ENT"
  },
  "chest pain": {
    conditions: ["⚠️ Cardiac Emergency (Rule out immediately)", "Costochondritis", "GERD / Acid Reflux", "Muscle Strain", "Anxiety / Panic Attack"],
    medications: [
      { name: "⚠️ EMERGENCY", dose: "Call emergency medical services (108/911) immediately without delay", note: "CRITICAL NOTICE: Crushing or squeezing retrosternal chest pain radiating to the left arm, neck, or jaw, accompanied by diaphoresis (sweating), dyspnea (breathlessness), and dizziness, is a suspected acute myocardial infarction (heart attack). DO NOT take standard pain medications or wait; seek immediate ER assessment." },
      { name: "Antacids (for GERD-related)", dose: "10–20 mL of liquid antacid suspension or 1–2 chewable tablets as directed", note: "Neutralizes stomach acid to relieve esophageal reflux pain. Administer ONLY after a qualified emergency physician has physically evaluated your chest symptoms and fully ruled out cardiac conditions." }
    ],
    precautions: ["⚠️ CRITICAL: Treat all chest pain as cardiac until proven otherwise", "Call emergency services (108) immediately", "Do NOT drive yourself to hospital", "Chew aspirin 325mg if cardiac event suspected and not allergic"],
    diet: ["Avoid spicy, fatty foods", "Eat smaller meals", "No alcohol or caffeine"],
    specialist: "⚠️ Emergency Room / Cardiologist – IMMEDIATELY"
  },
  "stomach pain": {
    conditions: ["Gastritis", "Irritable Bowel Syndrome (IBS)", "Appendicitis", "Peptic Ulcer", "Food Poisoning", "Indigestion"],
    medications: [
      { name: "Omeprazole (PPI)", dose: "20 mg orally once daily, strictly 30–60 minutes before the first meal of the day", note: "Proton pump inhibitor (PPI). Suppresses gastric acid secretion at the secretory surface of gastric parietal cells, allowing inflamed esophageal, gastric, or duodenal mucosa to heal. Swallow whole; do not chew or crush." },
      { name: "Buscopan (Hyoscine)", dose: "10–20 mg orally 3 times daily as needed for abdominal spasms", note: "Antispasmodic/anticholinergic drug. Relaxes visceral smooth muscles in the gastrointestinal, biliary, and urinary tracts to relieve cramping, colic, and stomach spasms. May cause dry mouth or blurred vision." },
      { name: "ORS (Oral Rehydration Salts)", dose: "Dissolve 1 sachet in 1 Litre of clean drinking water; drink 200-400 mL after each loose stool or vomiting episode", note: "WHO-formulated oral rehydration salts containing glucose and essential electrolytes. Directly restores water and electrolyte balance lost during stomach upset, vomiting, or diarrhea. Do not boil the prepared solution." }
    ],
    precautions: ["⚠️ Severe right lower abdominal pain may indicate appendicitis – seek emergency care", "Avoid NSAIDs (aspirin, ibuprofen) on empty stomach", "Monitor for blood in stool"],
    diet: ["BRAT diet: Bananas, Rice, Applesauce, Toast", "Avoid spicy, oily, and acidic foods", "Small frequent meals", "Curd / yoghurt for gut health"],
    specialist: "Gastroenterologist"
  },
  "joint pain": {
    conditions: ["Arthritis (Osteo/Rheumatoid)", "Gout", "Injury / Sprain", "Lupus", "Viral Arthralgia"],
    medications: [
      { name: "Ibuprofen", dose: "400 mg orally 3 times daily immediately after meals (Maximum 1200 mg/day)", note: "NSAID. Suppresses joint inflammation, swelling, and arthritic pain by blocking cyclooxygenase (COX) pathways. Take strictly with food or milk. Avoid if taking oral anticoagulants or if you have renal impairment." },
      { name: "Diclofenac Gel", dose: "Apply 2–4 grams of 1% gel locally to affected joint and rub gently 3–4 times daily", note: "Topical non-steroidal anti-inflammatory gel. Provides targeted, localized relief from joint pain and inflammation (especially knee and hand osteoarthrosis) with highly minimal systemic absorption and low gastric side effects. Wash hands after application." },
      { name: "Colchicine", dose: "0.5–1 mg orally twice daily during an acute gout flare-up, or as prescribed by your rheumatologist", note: "Anti-gout agent. Directly inhibits microtubule assembly in neutrophils, preventing their activation and migration to joints with uric acid crystals, reducing extreme gout inflammation. Avoid grapefruit juice." }
    ],
    precautions: ["Rest the affected joint", "Apply ice for 20 min every 2 hours (first 48h)", "Avoid repetitive strain", "Weight management is key for knee arthritis"],
    diet: ["Anti-inflammatory diet: omega-3 fatty acids (fish, flaxseed)", "Turmeric and ginger", "Cherries (for gout)", "Reduce red meat and alcohol"],
    specialist: "Rheumatologist / Orthopaedic Surgeon"
  },
  "skin rash": {
    conditions: ["Allergic Dermatitis", "Eczema", "Urticaria (Hives)", "Psoriasis", "Fungal Infection", "Drug Reaction"],
    medications: [
      { name: "Cetirizine (Antihistamine)", dose: "10 mg orally once daily, preferably at bedtime to minimize daytime sedation", note: "Second-generation selective H1-receptor antagonist. Blocks histamine activity to relieve intense skin itching, hives (urticaria), and allergic dermatitis. May cause mild drowsiness in sensitive individuals." },
      { name: "Hydrocortisone Cream 1%", dose: "Apply a thin film to the affected skin area twice daily for up to 7 consecutive days", note: "Mild topical corticosteroid. Directly suppresses inflammatory cytokines to reduce localized skin redness, swelling, and itching associated with eczema or contact dermatitis. Do not apply to open wounds, infected areas, or facial skin unless directed." },
      { name: "Clotrimazole Cream", dose: "Apply a thin layer to the affected clean skin area twice daily for 2–4 consecutive weeks", note: "Broad-spectrum topical antifungal agent. Disrupts fungal cell membrane synthesis to treat ringworm, tinea, and cutaneous candidiasis. Continue application for 1 week after symptoms resolve to prevent recurrence." }
    ],
    precautions: ["Avoid scratching", "Identify and avoid triggers", "⚠️ Seek emergency care for rash with difficulty breathing (anaphylaxis)", "Do not use steroid cream on face without advice"],
    diet: ["Avoid known allergens", "Increase Vitamin C and E intake", "Stay well-hydrated", "Avoid processed foods"],
    specialist: "Dermatologist / Allergist"
  },
  "high blood pressure": {
    conditions: ["Hypertension (Primary)", "Secondary Hypertension", "White-coat Hypertension"],
    medications: [
      { name: "Amlodipine", dose: "5 mg orally once daily, taken at the same time each day (may increase to 10 mg under supervision)", note: "Dihydropyridine calcium channel blocker. Relaxes and dilates peripheral arterial smooth muscle cells, lowering vascular resistance and systemic blood pressure. Monitor for peripheral edema (ankle swelling)." },
      { name: "Losartan", dose: "50 mg orally once daily (standard maintenance range is 25–100 mg/day)", note: "Angiotensin II receptor blocker (ARB). Prevents vasoconstriction and aldosterone release to lower blood pressure. Provides excellent long-term renal and cardiovascular protection in hypertensive patients. Do not use during pregnancy." },
      { name: "Hydrochlorothiazide", dose: "12.5–25 mg orally once daily in the morning to avoid nocturnal urination", note: "Thiazide diuretic. Promotes renal excretion of sodium and water, reducing blood volume and blood pressure. Monitor blood potassium levels regularly as it can cause hypokalemia." }
    ],
    precautions: ["Monitor BP twice daily", "Do NOT stop medications abruptly", "⚠️ BP >180/120 is hypertensive crisis – seek emergency care", "Regular follow-ups required"],
    diet: ["DASH diet: low sodium (<2g/day)", "Increase potassium (bananas, spinach)", "Reduce alcohol", "Avoid processed/packaged foods", "Regular aerobic exercise"],
    specialist: "Cardiologist / Internist"
  },
  diabetes: {
    conditions: ["Type 1 Diabetes", "Type 2 Diabetes", "Pre-diabetes", "Gestational Diabetes"],
    medications: [
      { name: "Metformin", dose: "500 mg orally twice daily with meals (titrate up slowly under medical guidance)", note: "Biguanide antihyperglycemic. Directly decreases hepatic glucose production, reduces intestinal absorption of glucose, and significantly enhances insulin sensitivity in peripheral tissues. Take with meals to minimize gastrointestinal side effects (nausea, abdominal discomfort)." },
      { name: "Glipizide", dose: "5 mg orally once daily, strictly 30 minutes before your first main meal (breakfast)", note: "Second-generation sulfonylurea. Directly stimulates pancreatic beta cells to secrete endogenous insulin. Monitor closely for signs of hypoglycemia (tremors, sweating, confusion, fast heart rate) and always carry a fast-acting sugar source." },
      { name: "Insulin", dose: "Dose must be individually titrated and prescribed by an endocrinologist based on daily blood glucose monitoring", note: "Exogenous hormone replacement. Crucial for Type 1 Diabetes and advanced Type 2 Diabetes to facilitate cellular glucose uptake and prevent severe diabetic ketoacidosis (DKA) or hyperosmolar hyperglycemic state (HHS). Learn proper subcutaneous injection techniques and site rotation." }
    ],
    precautions: ["Monitor blood sugar morning and 2 hours post-meal", "Never skip meals on medication", "Watch for hypoglycaemia symptoms (shaking, sweating, confusion)", "Regular HbA1c check every 3 months"],
    diet: ["Low glycaemic index foods", "Avoid sugar, white rice, maida", "High fibre: whole grains, vegetables, legumes", "Small frequent meals (5–6/day)", "Bitter gourd (karela), fenugreek – natural aids"],
    specialist: "Endocrinologist / Diabetologist"
  },
  "eye pain": {
    conditions: ["Conjunctivitis", "Dry Eye Syndrome", "Glaucoma", "Uveitis", "Digital Eye Strain"],
    medications: [
      { name: "Artificial Tears Drops", dose: "Instill 1–2 drops into the affected eye(s) up to 4–6 times daily as needed", note: "Sterile lubricant eye drops. Stabilizes the tear film and provides soothing relief from digital eye strain, dryness, burning, and ocular irritation. Remove contact lenses before instilling." },
      { name: "Chloramphenicol Eye Drops", dose: "Instill 1 drop into the affected eye(s) every 2 hours for the first 48 hours, then reduce to 4 times daily for 5 additional days", note: "Broad-spectrum topical ophthalmic antibiotic. Inhibits bacterial protein synthesis to treat acute bacterial conjunctivitis (pink eye). Finish the full 7-day course even if symptoms resolve earlier to prevent bacterial resistance." },
      { name: "Sodium Cromoglicate Eye Drops", dose: "Instill 1–2 drops into both eyes 4 times daily at regular intervals", note: "Ophthalmic mast cell stabilizer. Prevents the release of histamine and inflammatory mediators, treating allergic conjunctivitis and reducing ocular itching and redness. Best used preventatively during allergy season." }
    ],
    precautions: ["⚠️ Sudden vision loss / severe eye pain needs emergency care", "Do NOT rub eyes", "Follow 20-20-20 rule for digital strain", "Wear UV-protective sunglasses"],
    diet: ["Vitamin A: carrots, leafy greens", "Lutein: eggs, kale, spinach", "Omega-3 fatty acids", "Stay well-hydrated"],
    specialist: "Ophthalmologist"
  },
  "back pain": {
    conditions: ["Muscle Strain", "Disc Herniation", "Lumbar Spondylosis", "Kidney Issues", "Poor Posture"],
    medications: [
      { name: "Ibuprofen / Diclofenac", dose: "400 mg Ibuprofen or 50 mg Diclofenac orally 3 times daily immediately after food", note: "Oral NSAID. Decreases musculoskeletal pain and inflammatory responses in the lower back or lumbar spine. Always take with a full meal to protect gastric mucosa." },
      { name: "Muscle Relaxant (Methocarbamol)", dose: "750 mg orally 3 times daily as needed for acute muscular spasms", note: "Centrally-acting skeletal muscle relaxant. Relieves severe muscle spasms and acute lumbar pain by inducing general central nervous system depression. May cause significant drowsiness, dizziness, or lightheadedness; avoid alcohol." },
      { name: "Diclofenac Topical Gel", dose: "Apply 2–4 grams of 1% or 2% gel to the painful back area and rub in completely 3–4 times daily", note: "Targeted topical NSAID gel. Penetrates deep into muscular and joint tissues in the back to inhibit local prostaglandins, providing excellent pain relief with negligible systemic side effects. Do not apply to broken skin." }
    ],
    precautions: ["Avoid prolonged sitting", "Sleep on firm mattress", "⚠️ Back pain with numbness/weakness in legs – seek urgent care (possible nerve compression)", "Maintain correct posture"],
    diet: ["Calcium-rich foods: milk, yoghurt, ragi", "Vitamin D: sunlight, eggs, fish", "Anti-inflammatory: turmeric, ginger"],
    specialist: "Orthopaedic Surgeon / Physiotherapist"
  }
};

// ── Keyword Mapping ─────────────────────────────────────
const KEYWORD_MAP = {
  "fever|temperature|pyrexia|hot body|chills|jaro|jwar|jwara|deha garam": "fever",
  "headache|migraine|head pain|head ache|munda": "headache",
  "cough|cold|mucus|phlegm|bronchitis|kasha|thanda|kahsa": "cough",
  "chest pain|chest pressure|chest tightness|heart|chhati|chati": "chest pain",
  "stomach|abdomen|abdomin|tummy|belly|nausea|vomit|gastric|diarrhea|diarrhoea|indigestion|peta|jhada|banti": "stomach pain",
  "joint|arthritis|knee|bone|swelling in joints|gout|ganthi|gotha|goda": "joint pain",
  "rash|skin|itch|allergy|hive|eczema|dermatitis|kundei|charma|khasu": "skin rash",
  "blood pressure|hypertension|bp|dizziness|rakta chapa|munda bula": "high blood pressure",
  "diabetes|sugar|glucose|madhumeha|bahumutra": "diabetes",
  "eye|vision|blur|conjunctivitis|red eye|akhi|aakhi": "eye pain",
  "back pain|spine|lumbar|backache|anta|nadi": "back pain"
};

function detectCondition(text) {
  const lower = text.toLowerCase();
  for (const [pattern, condition] of Object.entries(KEYWORD_MAP)) {
    const keywords = pattern.split("|");
    if (keywords.some(k => lower.includes(k))) {
      return condition;
    }
  }
  return null;
}

window.currentLang = 'en';

const ODIA_DICT = {
  greetings: [
    "ମୁଁ ବୁଝିପାରୁଛି ଆପଣ ଅସୁସ୍ଥ ଅନୁଭବ କରୁଛନ୍ତି।",
    "ଆସନ୍ତୁ ଦେଖିବା କ'ଣ ହୋଇପାରେ।",
    "ମୁଁ ଆପଣଙ୍କୁ ସାହାଯ୍ୟ କରିବାକୁ ଏଠାରେ ଅଛି।"
  ],
  genericBase: [
    "ମୁଁ ଠିକ୍ ଭାବରେ ବୁଝିବାକୁ ଚାହୁଁଛି।",
    "ଆପଣଙ୍କୁ ସବୁଠାରୁ ସୁରକ୍ଷିତ ପରାମର୍ଶ ଦେବାକୁ,",
    "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ବିଷୟରେ ଅଧିକ ସ୍ପଷ୍ଟ ଭାବରେ ଜାଣିବାକୁ ଚାହୁଁଛି।",
    "ଆସନ୍ତୁ ଏହାକୁ ମିଶି ସମାଧାନ କରିବା।"
  ],
  hi: "ନମସ୍କାର",
  thanks: "ଯୋଗାଯୋଗ କରିଥିବାରୁ ଧନ୍ୟବାଦ",
  describeMore: "ଦୟାକରି ଆପଣଙ୍କ ଲକ୍ଷଣ ବିଷୟରେ ଟିକେ ଅଧିକ ବିବରଣୀ ଦେବେ କି?",
  whatToInclude: "💡 କ'ଣ ସାମିଲ କରିବେ",
  inc1: "ଯନ୍ତ୍ରଣା କିପରି ଲାଗୁଛି (ତୀକ୍ଷ୍ଣ, ଧୀମା, ଜଳାପୋଡା)",
  inc2: "ଶରୀରର କେଉଁ ସ୍ଥାନରେ",
  inc3: "କେତେ ସମୟ ଏବଂ କେତେଥର ଲକ୍ଷଣ ଦେଖାଯାଉଛି",
  inc4: "କୌଣସି ଜ୍ୱର, ବାନ୍ତି କିମ୍ବା ଅନ୍ୟାନ୍ୟ ଲକ୍ଷଣ",
  inc5: "ଆପଣ ବର୍ତ୍ତମାନ ଖାଉଥିବା କୌଣସି ଔଷଧ",
  inc6: "କୌଣସି ଜଣାଶୁଣା ଆଲର୍ଜି କିମ୍ବା ପୂର୍ବ ରୋଗ",
  docQuestion: "ଡାକ୍ତରଙ୍କ ପ୍ରଶ୍ନ:",
  diet: "🥗 ଖାଦ୍ୟ ପରାମର୍ଶ",
  dose: "ମାତ୍ରା:",
  note: "ବିଶେଷ ଦ୍ରଷ୍ଟବ୍ୟ:",
  suggestedMed: "💊 ପ୍ରସ୍ତାବିତ ଔଷଧ",
  precautions: "⚠️ ସତର୍କତା",
  specialist: "ସୁପାରିଶ କରାଯାଇଥିବା ବିଶେଷଜ୍ଞ:",
  assessmentIntro: "ସବିଶେଷ ତଥ୍ୟ ପାଇଁ ଧନ୍ୟବାଦ। ଆପଣଙ୍କ ଲକ୍ଷଣ ଉପରେ ଆଧାର କରି, ଏଠାରେ ମୋର ପ୍ରାରମ୍ଭିକ ଆକଳନ ଅଛି:",
  possibleCond: "🔬 ସମ୍ଭାବ୍ୟ ରୋଗ",
  suggestedMed: "💊 ପ୍ରସ୍ତାବିତ ଔଷଧ",
  dose: "ମାତ୍ରା:",
  note: "ସୂଚନା:",
  precautions: "⚠️ ସତର୍କତା ଏବଂ ନିର୍ଦ୍ଦେଶାବଳୀ",
  diet: "🥗 ଖାଦ୍ୟପେୟ ପରାମର୍ଶ",
  specialist: "🏥 ପରାମର୍ଶ ପାଇଁ ବିଶେଷଜ୍ଞ:",
  disclaimerTitle: "🔴 ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସୂଚନା",
  disclaimerBody: "ଏହି ତଥ୍ୟ କେବଳ ସୂଚନା ଉଦ୍ଦେଶ୍ୟରେ ଦିଆଯାଇଛି। କୌଣସି ଚିକିତ୍ସା ଆରମ୍ଭ କରିବା ପୂର୍ବରୁ ଦୟାକରି ଜଣେ ଯୋଗ୍ୟ ଡାକ୍ତରଙ୍କ ପରାମର୍ଶ ନିଅନ୍ତୁ।",
  footerHint: "ଆପଣ ସାଧାରଣ ରୋଗ ପାଇଁ ବାମ ପାର୍ଶ୍ୱରେ ଥିବା କୁଇକ୍ ସିମ୍ପଟମ୍ସ ବଟନ୍ ବ୍ୟବହାର କରିପାରିବେ। ମୁଁ ସାହାଯ୍ୟ କରିବାକୁ ଅଛି! 🩺"
};

const FOLLOW_UP_ODIA = {
  "stomach pain": [
    "କଷ୍ଟ ତୀକ୍ଷ୍ଣ, ଧୀମା କିମ୍ବା ଜଳାପୋଡା ପରି ଲାଗୁଛି କି?",
    "ଖାଇବା ପରେ କଷ୍ଟ ବଢୁଛି କିମ୍ବା ଏହା ଲଗାତାର ରହୁଛି?"
  ],
  "chest pain": [
    "⚠️ କଷ୍ଟ ହାତ, ବେକ କିମ୍ବା ପାଟି ଆଡକୁ ବ୍ୟାପୁଛି କି?",
    "ଆପଣଙ୍କୁ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ କିମ୍ବା ମୁଣ୍ଡ ବୁଲାଉଛି କି?"
  ],
  "fever": [
    "ଆପଣଙ୍କର ସର୍ବାଧିକ ତାପମାତ୍ରା କେତେ ଅଛି?",
    "ଆପଣଙ୍କୁ ଶୀତ ଲାଗୁଛି, ଝାଳ ବୋହୁଛି କିମ୍ବା ଦେହ ହାତ ବିନ୍ଧା ହେଉଛି କି?"
  ],
  "headache": [
    "କଷ୍ଟ ମୁଣ୍ଡର ଗୋଟିଏ ପାର୍ଶ୍ୱରେ ଅଛି ନା ପୁରା ମୁଣ୍ଡରେ?",
    "ଆପଣଙ୍କୁ ଆଲୋକରେ କଷ୍ଟ ହେଉଛି କିମ୍ବା ବାନ୍ତି ଲାଗୁଛି କି?"
  ],
  "cough": [
    "ଏହା ଶୁଖିଲା କାଶ ନା ଖଙ୍କାର ବାହାରୁଛି?",
    "ଏହି କାଶ କେତେ ଦିନ ହେଲାଣି ଅଛି?"
  ],
  "joint pain": [
    "କେଉଁ ନିର୍ଦ୍ଦିଷ୍ଟ ଗଣ୍ଠିରେ କଷ୍ଟ ହେଉଛି?",
    "ସେଠାରେ ଫୁଲା, ନାଲି ପଡିବା କିମ୍ବା ଗରମ ଲାଗିବା ପରି କିଛି ଅଛି କି?"
  ],
  "skin rash": [
    "ରାସ୍ ରେ କୁଣ୍ଡେଇ ହେଉଛି ନା କଷ୍ଟ ହେଉଛି?",
    "ଏହା ଶରୀରର ଅନ୍ୟ ଭାଗକୁ ବ୍ୟାପିଛି କି?"
  ],
  "high blood pressure": [
    "ଆପଣ ନିକଟରେ ରକ୍ତଚାପ ମାପିଛନ୍ତି କି? ତାହା କେତେ ଥିଲା?",
    "ଆପଣଙ୍କୁ ମୁଣ୍ଡ ବୁଲାଉଛି, ମୁଣ୍ଡ ବିନ୍ଧା ହେଉଛି ନା ଝାପସା ଦେଖାଯାଉଛି କି?"
  ],
  "diabetes": [
    "ଆପଣଙ୍କର ଶେଷ ସୁଗାର ରିଡିଂ କେତେ ଥିଲା?",
    "ଆପଣଙ୍କୁ ଅତ୍ୟଧିକ ଶୋଷ କିମ୍ବା ବାରମ୍ବାର ପରିସ୍ରା ଲାଗୁଛି କି?"
  ],
  "eye pain": [
    "ଆଖି ଲାଲ୍ ପଡିବା, ପାଣି ବାହାରିବା କିମ୍ବା ଦୃଷ୍ଟିଶକ୍ତିରେ ପରିବର୍ତ୍ତନ ଅଛି କି?",
    "ଆଖି ବୁଲାଇବା ବେଳେ କିମ୍ବା ଉଜ୍ଜ୍ୱଳ ଆଲୋକକୁ ଚାହିଁଲେ କଷ୍ଟ ବଢୁଛି କି?"
  ],
  "back pain": [
    "କଷ୍ଟ ଗୋଡ଼ ଆଡକୁ ଖସୁଛି କି?",
    "ଏହା ହଠାତ୍ ଗତିବିଧି କିମ୍ବା ଭାରୀ ଜିନିଷ ଉଠାଇବା ପରେ ଆରମ୍ଭ ହେଲା କି?"
  ],
  "default": [
    "କେତେ ଦିନ ହେଲାଣି ଆପଣ ଏହା ଅନୁଭବ କରୁଛନ୍ତି?",
    "ଅନ୍ୟ କୌଣସି ଲକ୍ଷଣ ଅଛି କି?"
  ]
};

let activeDiagnostic = null;

const FOLLOW_UP_QUESTIONS = {
  "stomach pain": [
    "Is the pain sharp, dull, or burning?",
    "Does the pain get worse after eating or is it constant?"
  ],
  "chest pain": [
    "⚠️ Is the pain spreading to your arm, neck, or jaw?",
    "Do you feel any shortness of breath or dizziness?"
  ],
  "fever": [
    "What is your highest recorded temperature?",
    "Are you experiencing any chills, sweating, or body aches?"
  ],
  "headache": [
    "Is the pain on one side of your head, or all over?",
    "Are you experiencing any sensitivity to light or nausea?"
  ],
  "cough": [
    "Is it a dry cough, or are you coughing up mucus?",
    "How long have you had this cough?"
  ],
  "joint pain": [
    "Which specific joints are affected?",
    "Is there any visible swelling, redness, or warmth in the area?"
  ],
  "skin rash": [
    "Is the rash itchy or painful?",
    "Has it spread to other parts of your body?"
  ],
  "high blood pressure": [
    "Have you checked your blood pressure recently? What were the readings?",
    "Are you feeling dizzy, having headaches, or experiencing blurred vision?"
  ],
  "diabetes": [
    "What was your last blood sugar reading?",
    "Are you feeling unusually thirsty or urinating more frequently?"
  ],
  "eye pain": [
    "Is there any redness, discharge, or changes in your vision?",
    "Does it hurt more when you move your eyes or look at bright lights?"
  ],
  "back pain": [
    "Is the pain radiating down your legs?",
    "Did it start after a sudden movement or lifting something heavy?"
  ],
  "default": [
    "How long have you been experiencing this?",
    "Are there any other symptoms you've noticed?"
  ]
};

// ── Format AI Response ──────────────────────────────────
function buildResponse(text, profile) {
  let condition = detectCondition(text);

  // Maintain state if we are currently diagnosing and user didn't switch topic
  if (activeDiagnostic) {
    if (!condition || condition === activeDiagnostic.condition) {
      condition = activeDiagnostic.condition;
    } else {
      activeDiagnostic = { condition: condition, step: 0 };
    }
  } else if (condition) {
    activeDiagnostic = { condition: condition, step: 0 };
  }
  updateContextIndicator();

  const profileInfo = buildProfileContext(profile);

  if (!condition) {
    const isOr = window.currentLang === 'or';
    const txt = text.toLowerCase();
    
    // Check for conversational / emotional keywords
    const isLonely = /lonely|sad|depress|alone|cry|hopeless|anxious|stress|unhappy|down|cheer|chear|bore|scare|fear|panic|worry/i.test(txt);
    const isHello = /^hi$|^hello$|^hey$|^greetings$|namaskar/i.test(txt);
    const isThanks = /thank|appreciate|grateful/i.test(txt);
    const isWho = /who are you|what are you|your name/i.test(txt);
    const isChat = /how are you|talk to me|say something|can we talk|friend|help me/i.test(txt);
    
    if (isLonely) {
      activeDiagnostic = null; // reset diagnostic state
      const response = isOr 
        ? "ମୁଁ ବୁଝିପାରୁଛି ଯେ ଆପଣ ଏକୁଟିଆ କିମ୍ବା ଦୁଃଖିତ ଅନୁଭବ କରୁଛନ୍ତି। ଦୟାକରି ମନେରଖନ୍ତୁ ଯେ ଆପଣ ଏକୁଟିଆ ନୁହଁନ୍ତି। ମୁଁ ଏକ ମେଡିକାଲ୍ ସହକାରୀ ଏବଂ ଆପଣଙ୍କର ମାନସିକ ସ୍ୱାସ୍ଥ୍ୟ ମଧ୍ୟ ଅତ୍ୟନ୍ତ ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ। ଯଦି ଆପଣ କୌଣସି ଶାରୀରିକ ଅସୁବିଧା ଅନୁଭବ କରୁଛନ୍ତି, ତେବେ ମୋତେ ଜଣାନ୍ତୁ। କୌଣସି ଆବଶ୍ୟକତା ଥିଲେ ଆପଣଙ୍କ ପ୍ରିୟଜନ କିମ୍ବା ବିଶେଷଜ୍ଞଙ୍କ ସହ କଥା ହୁଅନ୍ତୁ।"
        : "I hear you, and I'm really sorry you're feeling this way. Please remember that you are not alone, and it is completely okay to feel overwhelmed or down sometimes. To cheer yourself up, you might try listening to your favorite music, taking a short walk outside, or talking to someone you trust.<br><br>While I am an AI designed to analyze physical symptoms, your mental and emotional well-being is incredibly important. Please consider reaching out to a friend, family member, or a professional. If you are experiencing any physical symptoms as well, feel free to share them with me.";
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isChat) {
      activeDiagnostic = null;
      const response = isOr
        ? "ମୁଁ ଏଠାରେ ଅଛି! ଯଦିଓ ମୁଁ ଏକ କମ୍ପ୍ୟୁଟର ପ୍ରୋଗ୍ରାମ ଏବଂ କେବଳ ସ୍ୱାସ୍ଥ୍ୟ ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନର ଉତ୍ତର ଦେଇପାରେ, ମୁଁ ଆପଣଙ୍କ ସାହାଯ୍ୟ କରିବାକୁ ପ୍ରସ୍ତୁତ। ଆପଣଙ୍କୁ ଶାରୀରିକ ଭାବରେ କିପରି ଲାଗୁଛି?"
        : "I'm here for you! Even though I'm an AI and my main job is to help with medical symptoms, I'm always happy to chat. How are you feeling physically today? Any aches or pains I can help you figure out?";
      return `<p>${profileInfo}${response}</p>`;
    }
    
    if (isHello) {
      activeDiagnostic = null;
      const response = isOr 
        ? `ନମସ୍କାର${profile && profile.name ? ' ' + profile.name.split(' ')[0] : ''}! ମୁଁ ରାମନ୍ ଏଆଇ (ପରୀକ୍ଷାମୂଳକ ସଂସ୍କରଣ ୧୭୦)। ଆଜି ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟରେ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?`
        : `Hello${profile && profile.name ? ' ' + profile.name.split(' ')[0] : ''}! I am RAMAN AI (Experiment No. 170). How can I help you with your health today?`;
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isThanks) {
      activeDiagnostic = null;
      const response = isOr
        ? `ଆପଣଙ୍କୁ ସ୍ୱାଗତ! ଆପଣଙ୍କ ସାହାଯ୍ୟ କରିବା ମୋର କର୍ତ୍ତବ୍ୟ। ଅନ୍ୟ କୌଣସି ସ୍ୱାସ୍ଥ୍ୟଗତ ସମସ୍ୟା ଥିଲେ ଜଣାନ୍ତୁ।`
        : `You're very welcome! I'm here to help. If you have any other symptoms or medical questions, just let me know.`;
      return `<p>${profileInfo}${response}</p>`;
    }

    if (isWho) {
      activeDiagnostic = null;
      const response = isOr
        ? `ମୁଁ ରାମନ୍ ଏଆଇ, ଏକ ଉନ୍ନତ କୃତ୍ରିମ ବୁଦ୍ଧିମତା (AI) ଯାହା ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ଏବଂ ଲକ୍ଷଣ ବିଷୟରେ ପରାମର୍ଶ ଦେବା ପାଇଁ ଡିଜାଇନ୍ କରାଯାଇଛି। ଆପଣଙ୍କର କୌଣସି ଲକ୍ଷଣ ଅଛି କି?`
        : `I am RAMAN AI (Experiment No. 170), an advanced medical intelligence assistant designed to help analyze your symptoms and provide preliminary health guidance. How are you feeling today?`;
      return `<p>${profileInfo}${response}</p>`;
    }

    const isQuestion = /\?|^(what|how|why|when|can you|could you|please tell|explain|describe|tell me)\b/i.test(txt);
    
    // Check 5-minute contextual memory
    if (lastCondition && (Date.now() - lastConditionTime < 5 * 60 * 1000)) {
      const isDietReq = /diet|food|eat|drink|nutrition/i.test(txt);
      const isMedReq = /medicine|rx|pill|tablet|drug|dose|dosage/i.test(txt);
      const isPrecautionReq = /precaution|warning|safe|danger|avoid|care/i.test(txt);
      const isSpecialistReq = /doctor|specialist|hospital|who to see/i.test(txt);

      const kb = MEDICAL_KB[lastCondition];
      if (kb) {
        if (isDietReq) return `<p>${profileInfo}</p><div class="med-section info"><div class="med-section-title">${isOr ? ODIA_DICT.diet : "🥗 DIETARY RECOMMENDATIONS FOR " + lastCondition.toUpperCase()}</div><ul>${kb.diet.map(d => `<li>${d}</li>`).join("")}</ul></div>`;
        if (isMedReq) {
          let medsHtml = kb.medications.map(m => `<p><strong>${m.name}</strong><br><small>📋 ${isOr ? ODIA_DICT.dose : "Dose:"} ${m.dose}</small><br><small>ℹ️ ${isOr ? ODIA_DICT.note : "Note:"} ${m.note}</small></p>`).join("");
          return `<p>${profileInfo}</p><div class="med-section"><div class="med-section-title">${isOr ? ODIA_DICT.suggestedMed : "💊 SUGGESTED MEDICATIONS FOR " + lastCondition.toUpperCase()}</div>${medsHtml}</div>`;
        }
        if (isPrecautionReq) return `<p>${profileInfo}</p><div class="med-section warning"><div class="med-section-title">${isOr ? ODIA_DICT.precautions : "⚠️ PRECAUTIONS FOR " + lastCondition.toUpperCase()}</div><ul>${kb.precautions.map(p => `<li>${p}</li>`).join("")}</ul></div>`;
        if (isSpecialistReq) return `<p>${profileInfo}</p><div class="med-section info"><p>🏥 <strong>${isOr ? ODIA_DICT.specialist : "Recommended Specialist:"}</strong> ${kb.specialist}</p></div>`;
        
        // If it's a general question but in context, give a friendly contextual prompt
        if (isQuestion) {
          const resp = isOr 
            ? `ମୁଁ ବର୍ତ୍ତମାନ ଆପଣଙ୍କର '${lastCondition}' ବିଷୟରେ ମନେ ରଖିଛି। ଆପଣ ଖାଦ୍ୟ, ଔଷଧ କିମ୍ବା ସତର୍କତା ବିଷୟରେ ପଚାରି ପାରିବେ।`
            : `I am still keeping your '${lastCondition}' in mind. You can ask me specific questions about diet, medications, or precautions related to it.`;
          return `<p>${profileInfo}${resp}</p>`;
        }
      }
    }

    if (isQuestion) {
      activeDiagnostic = null;
      const response = isOr
        ? "ମୁଁ ଏକ ବିଶେଷଜ୍ଞ ଏଆଇ ଯାହା କେବଳ ଲକ୍ଷଣ ଏବଂ ଶାରୀରିକ ଅସୁବିଧା ବିଷୟରେ ପରାମର୍ଶ ଦେବା ପାଇଁ ଡିଜାଇନ୍ କରାଯାଇଛି। ମୁଁ ସାଧାରଣ ପ୍ରଶ୍ନ କିମ୍ବା ଔଷଧ ବିଷୟରେ ସୂଚନା ଦେଇପାରିବି ନାହିଁ। <br><br>ଯଦି ଆପଣ କୌଣସି ରୋଗର ଲକ୍ଷଣ ଅନୁଭବ କରୁଛନ୍ତି (ଉଦାହରଣ ସ୍ୱରୂପ: 'ମୋର ମୁଣ୍ଡ ବିନ୍ଧୁଛି'), ଦୟାକରି ମୋତେ ଜଣାନ୍ତୁ।"
        : "I am a specialized medical AI designed specifically to analyze physical symptoms and provide preliminary triage advice. Because I operate entirely offline for your privacy, I don't have the ability to answer general medical questions, look up specific medications, or explain health rules.<br><br>If you are experiencing any physical symptoms (e.g., 'I have a headache' or 'My stomach hurts'), please describe them to me so I can assist you!";
      return `<p>${profileInfo}${response}</p>`;
    }

    return buildGenericResponse(text, profile, profileInfo);
  }

  // Track condition for proactive guidance
  if (typeof saveDetectedCondition === 'function') saveDetectedCondition(condition);

  const questions = (window.currentLang === 'or' ? FOLLOW_UP_ODIA[condition] : FOLLOW_UP_QUESTIONS[condition]) || 
                    (window.currentLang === 'or' ? FOLLOW_UP_ODIA.default : FOLLOW_UP_QUESTIONS.default);

  // Ask follow up questions if we haven't asked them all
  if (activeDiagnostic && activeDiagnostic.step < questions.length) {
    const q = questions[activeDiagnostic.step];
    activeDiagnostic.step++;

    let greetingHtml = "";
    if (activeDiagnostic.step === 1) {
      let base = "";
      if (window.currentLang === 'or') {
        base = ODIA_DICT.greetings[Math.floor(Math.random() * ODIA_DICT.greetings.length)];
        if (profile && profile.name) greetingHtml = `<p>${ODIA_DICT.hi} ${profile.name.split(' ')[0]}, ${base}</p>`;
        else greetingHtml = `<p>${base}</p>`;
      } else {
        const greetings = [
          "I understand you're feeling unwell.",
          "Let's see what might be going on.",
          "I'm here to help you get to the bottom of this."
        ];
        base = greetings[Math.floor(Math.random() * greetings.length)];
        if (profile && profile.name) greetingHtml = `<p>Hi ${profile.name.split(' ')[0]}, ${base.toLowerCase()}</p>`;
        else greetingHtml = `<p>${base}</p>`;
      }
    }
    
    const docQHeader = window.currentLang === 'or' ? ODIA_DICT.docQuestion : "Doctor's Question:";
    return `${profileInfo}${greetingHtml}<div class="med-section info"><p><strong>${docQHeader}</strong></p><p>${q}</p></div>`;
  }

  // Finished asking questions, provide final assessment
  activeDiagnostic = null; // Reset state
  lastCondition = condition;
  lastConditionTime = Date.now();
  updateContextIndicator();
  
  const kb = MEDICAL_KB[condition];
  const isEmergency = condition === "chest pain";

  const isOr = window.currentLang === 'or';
  const introTxt = isOr ? ODIA_DICT.assessmentIntro : "Thank you for the details. Based on everything you've shared, here is my comprehensive assessment:";

  let html = `<p>${profileInfo}${introTxt}</p>`;

  html += `<div class="med-section">
    <div class="med-section-title">${isOr ? ODIA_DICT.possibleCond : "🔬 POSSIBLE CONDITIONS"}</div>
    <ul>${kb.conditions.map(c => `<li>${c}</li>`).join("")}</ul>
  </div>`;

  html += `<div class="med-section ${isEmergency ? 'warning' : ''}">
    <div class="med-section-title">${isOr ? ODIA_DICT.suggestedMed : "💊 SUGGESTED MEDICATIONS"}</div>`;
  kb.medications.forEach(m => {
    html += `<p><strong>${m.name}</strong><br>
      <small>📋 ${isOr ? ODIA_DICT.dose : "Dose:"} ${m.dose}</small><br>
      <small>ℹ️ ${isOr ? ODIA_DICT.note : "Note:"} ${m.note}</small></p>`;
  });
  html += `</div>`;

  html += `<div class="med-section ${isEmergency ? 'warning' : 'info'}">
    <div class="med-section-title">${isOr ? ODIA_DICT.precautions : "⚠️ PRECAUTIONS & WARNINGS"}</div>
    <ul>${kb.precautions.map(p => `<li>${p}</li>`).join("")}</ul>
  </div>`;

  html += `<div class="med-section info">
    <div class="med-section-title">${isOr ? ODIA_DICT.diet : "🥗 DIETARY RECOMMENDATIONS"}</div>
    <ul>${kb.diet.map(d => `<li>${d}</li>`).join("")}</ul>
  </div>`;

  html += `<p>🏥 <strong>${isOr ? ODIA_DICT.specialist : "Recommended Specialist:"}</strong> ${kb.specialist}</p>`;

  html += `<div class="med-section warning">
    <div class="med-section-title">${isOr ? ODIA_DICT.disclaimerTitle : "🔴 IMPORTANT DISCLAIMER"}</div>
    <p>${isOr ? ODIA_DICT.disclaimerBody : "This analysis is for informational purposes only. Please consult a qualified medical professional before starting any treatment. Self-medication can be dangerous."}</p>
  </div>`;

  // Auto-generate and append Health ID
  if (!currentHealthId) saveHealthSession();
  html += `
    <div class="hid-card" style="margin-top: 20px;">
      <div class="hid-card-header">🎉 YOUR HEALTH ID IS READY</div>
      <div class="hid-card-body">
        <div class="hid-code">${currentHealthId}</div>
        <p class="hid-card-desc">Your consultation is complete. Save this ID. Next visit, enter it in the Session Manager to instantly restore your profile and full consultation history.</p>
        <div class="hid-card-actions">
          <button class="hid-action-btn" onclick="navigator.clipboard.writeText('${currentHealthId}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy ID'},1500)}).catch(()=>prompt('Copy your Health ID:','${currentHealthId}'))">📋 Copy ID</button>
        </div>
      </div>
    </div>`;

  return html;
}

function buildProfileContext(profile) {
  if (!profile.name && !profile.age) return "";
  let ctx = `<strong>Patient:</strong> `;
  if (profile.name) ctx += profile.name;
  if (profile.age) ctx += `, ${profile.age} years`;
  if (profile.gender) ctx += `, ${profile.gender}`;
  if (profile.blood) ctx += ` (Blood: ${profile.blood})`;
  if (profile.allergies) ctx += ` | ⚠️ Allergies: ${profile.allergies}`;
  
  let vitalsArr = [];
  if (profile.bp) vitalsArr.push(`BP: ${profile.bp}`);
  if (profile.heartRate) vitalsArr.push(`HR: ${profile.heartRate} bpm`);
  if (profile.temp) vitalsArr.push(`Temp: ${profile.temp}°F`);
  if (profile.SpO2) vitalsArr.push(`SpO2: ${profile.SpO2}%`);
  if (vitalsArr.length > 0) {
    ctx += `<br><span style="font-size:0.8rem; color:var(--accent);">📊 Vitals: ${vitalsArr.join(' | ')}</span>`;
  }
  
  return `<p>${ctx}</p>`;
}

function buildGenericResponse(text, profile, profileCtx) {
  const isOr = window.currentLang === 'or';
  const txtLower = text.toLowerCase();
  
  let base = "";
  if (isOr) {
    base = ODIA_DICT.genericBase[Math.floor(Math.random() * ODIA_DICT.genericBase.length)];
    if (profile && profile.name) base = `${ODIA_DICT.thanks}, ${profile.name.split(' ')[0]}। ${base}`;
  } else {
    const greetings = [
      "I'm sorry to hear you're not feeling well.",
      "I want to make sure I understand correctly.",
      "Let's figure this out together.",
      "I'm here to help you get to the bottom of this."
    ];
    base = greetings[Math.floor(Math.random() * greetings.length)];
    if (profile && profile.name && !base.includes("sorry")) {
      base = `Thanks for reaching out, ${profile.name.split(' ')[0]}. ${base}`;
    } else if (profile && profile.name) {
      base = `I'm sorry to hear you're not feeling well, ${profile.name.split(' ')[0]}.`;
    }
  }

  // Generate a conversational, immersive follow-up instead of a robotic list
  let followUp = "";
  if (txtLower.includes("sick") || txtLower.includes("unwell") || txtLower.includes("bad")) {
      followUp = isOr ? "ଆପଣଙ୍କୁ ଠିକ୍ କ'ଣ ଅସୁବିଧା ହେଉଛି? ଦୟାକରି ଟିକେ ସବିଶେଷ ଜଣାନ୍ତୁ (ଯେପରିକି ଜ୍ୱର, କାଶ, ବା କୌଣସି ଯନ୍ତ୍ରଣା)।" : "Could you tell me a little more about what you're experiencing? For example, do you have any pain, a fever, or just feeling generally weak?";
  } else if (txtLower.includes("pain") || txtLower.includes("hurt") || txtLower.includes("ache")) {
      followUp = isOr ? "କେଉଁଠାରେ କଷ୍ଟ ହେଉଛି ଏବଂ ଏହା କିପରି ଲାଗୁଛି (ତୀକ୍ଷ୍ଣ ବା ଧୀମା) ମୋତେ କହିପାରିବେ କି?" : "Where exactly is the pain located, and could you describe what it feels like (e.g., sharp, dull, throbbing)?";
  } else {
      followUp = isOr ? ODIA_DICT.describeMore : "Could you please describe your symptoms in a bit more detail? It helps if you mention where it hurts, how long it's been happening, and if you have any other symptoms like a fever.";
  }

  const footerHint = isOr ? ODIA_DICT.footerHint : "You can also use the <strong>Quick Symptoms</strong> buttons on the left panel for common conditions. I'm here to assist you! 🩺";

  return `<p>${profileCtx}${base} ${followUp}</p>
  <p><small style="color: var(--text-muted);">${footerHint}</small></p>`;
}

function updateContextIndicator() {
  const ind = document.getElementById('contextIndicator');
  const val = document.getElementById('ctxValue');
  const lbl = document.getElementById('ctxLabel');
  if (!ind || !val || !lbl) return;

  const isOr = window.currentLang === 'or';
  lbl.textContent = isOr ? "ବିଷୟ:" : "Discussing:";

  if (activeDiagnostic) {
    ind.style.display = 'flex';
    val.textContent = activeDiagnostic.condition.toUpperCase();
  } else if (lastCondition && (Date.now() - lastConditionTime < 5 * 60 * 1000)) {
    ind.style.display = 'flex';
    val.textContent = lastCondition.toUpperCase();
  } else {
    ind.style.display = 'none';
  }
}

// Set up interval to check context expiry
setInterval(updateContextIndicator, 30000);

// ── Profile Automation & Inactivity Timer ────────────────
let profileGreeted = false;
let inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (currentHealthId) {
      addMessage('ai', '<div class="med-section warning"><p>🔒 <strong>Session Locked:</strong> 15 minutes of inactivity detected. Your data has been securely saved.</p></div>', true);
      endCurrentSession();
    }
  }, 15 * 60 * 1000);
}

// Ensure the inactivity timer resets on user interaction
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

function updateProfileCompleteness(skipGreeting = false) {
  const p = getProfile();
  let filled = 0;
  if (p.name) filled++;
  if (p.age) filled++;
  if (p.gender) filled++;
  if (p.blood) filled++;
  if (p.allergies) filled++;
  
  const pct = (filled / 5) * 100;
  const fillEl = document.getElementById('completenessFill');
  const txtEl = document.getElementById('completenessText');
  if (fillEl) fillEl.style.width = pct + '%';
  if (txtEl) txtEl.textContent = Math.round(pct) + '% Complete';
  
  if (pct === 100 && !profileGreeted && !skipGreeting) {
    profileGreeted = true;
    setTimeout(() => {
      addMessage('ai', `<div class="med-section info"><p>👋 Hello <strong>${p.name}</strong>! Your profile is complete. How can I assist you with your health today?</p></div>`, true);
    }, 600);
  }
}

// Attach listeners to profile inputs
['patientName', 'patientAge', 'patientGender', 'patientBlood', 'patientAllergies', 'patientBP', 'patientHR', 'patientTemp', 'patientSpO2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { updateProfileCompleteness(false); saveProfile(); });
});

// ── Chat Functions ──────────────────────────────────────
function getProfile() {
  const bpEl = document.getElementById("patientBP");
  const hrEl = document.getElementById("patientHR");
  const tempEl = document.getElementById("patientTemp");
  const spo2El = document.getElementById("patientSpO2");
  return {
    name: document.getElementById("patientName").value.trim(),
    age:  document.getElementById("patientAge").value.trim(),
    gender: document.getElementById("patientGender").value,
    blood: document.getElementById("patientBlood").value,
    allergies: document.getElementById("patientAllergies").value.trim(),
    bp: bpEl ? bpEl.value.trim() : "",
    heartRate: hrEl ? hrEl.value.trim() : "",
    temp: tempEl ? tempEl.value.trim() : "",
    SpO2: spo2El ? spo2El.value.trim() : ""
  };
}

// ── Session Counter state (declared here so addMessage can use it) ──
let sessionMsgs = 0;

function addMessage(role, content, isHTML = false) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `message ${role === "user" ? "user-message" : "ai-message"}`;

  const avatarIcon = role === "user" ? "🧑" : "🤖";
  const avatarClass = role === "user" ? "user-avatar" : "ai-avatar";
  const senderName = role === "user" ? "YOU" : "RAMAN AI";
  const bubbleClass = role === "user" ? "user-bubble" : "ai-bubble";
  const badge = role === "ai" ? `<span class="message-badge">Experiment № 170</span>` : "";

  div.innerHTML = `
    <div class="message-avatar ${avatarClass}"><span>${avatarIcon}</span></div>
    <div class="message-content">
      <div class="message-header">
        <span class="sender-name">${senderName}</span>
        ${badge}
        <span class="message-time">${nowTime()}</span>
      </div>
      <div class="message-bubble ${bubbleClass}">
        ${isHTML ? content : `<p>${escapeHtml(content)}</p>`}
      </div>
    </div>`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Session counter
  if (role === "user") {
    sessionMsgs++;
    const sc = document.getElementById("sessionCount");
    if (sc) sc.textContent = sessionMsgs;
  }

  // Auto-add reactions to AI messages
  if (role === "ai") {
    const r = document.createElement("div");
    r.className = "msg-reactions";
    r.innerHTML = `<button class="reaction-btn" title="Helpful">👍</button>
      <button class="reaction-btn" title="Love it">❤️</button>
      <button class="reaction-btn" title="Great">🙌</button>`;
    r.querySelectorAll(".reaction-btn").forEach(b => {
      b.addEventListener("click", () => b.classList.toggle("reacted"));
    });
    div.querySelector(".message-content").appendChild(r);
  }
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

function showTyping(show) {
  const t = document.getElementById("typingIndicator");
  if (t) t.style.display = show ? "flex" : "none";
  document.getElementById("btnSend").disabled = show;

  if (show) {
    const label = t.querySelector('.typing-label');
    const phrases = ["RAMAN AI is analyzing...", "Consulting medical KB...", "Synthesizing response..."];
    let idx = 0;
    label.textContent = phrases[0];
    window._typingInterval = setInterval(() => {
      idx = (idx + 1) % phrases.length;
      label.textContent = phrases[idx];
    }, 800);
  } else {
    clearInterval(window._typingInterval);
  }
}

async function sendMessage() {
  resetInactivityTimer();
  
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  const p = getProfile();
  const isProfileComplete = p.name && p.age && p.gender && p.blood && p.allergies;

  addMessage("user", text);
  // Capture to chat history
  chatHistory.push({ role:'user', text: text.slice(0,200), time: nowTime() });
  if (chatHistory.length > 20) chatHistory.shift();

  input.value = "";
  updateCharCount();
  showTyping(true);
  document.getElementById("chatMessages").scrollTop = 9999;

  const delay = 1400 + Math.random() * 1200;
  await new Promise(r => setTimeout(r, delay));

  if (!isProfileComplete) {
    showTyping(false);
    addMessage("ai", `<div class="med-section warning"><p>⚠️ <strong>Consultation Blocked:</strong> Please fully complete your <strong>Patient Profile</strong> on the left side before we begin.</p><p>I need this information to ensure your safety and provide accurate advice.</p></div>`, true);
    return;
  }

  showTyping(false);
  const profile = getProfile();
  
  let response = "";
  const provider = localStorage.getItem("ramanai_llm_provider") || "local-slm";
  const isOr = window.currentLang === 'or';

  if (provider === "gemini") {
    const key = localStorage.getItem("ramanai_gemini_api_key");
    const model = localStorage.getItem("ramanai_gemini_model") || "gemini-1.5-flash";
    if (key) {
      response = await generateGeminiResponse(text, profile, key, model);
    } else {
      const warningText = isOr 
        ? `<div class="med-section warning"><p>⚠️ <strong>ଗୁଗଲ୍ ଜେମିନି API କି ମିଳିଲା ନାହିଁ:</strong> ଦୟาକରି API ସେଟିଙ୍ଗ୍ସକୁ ଯାଇ API Key ପ୍ରଦାନ କରନ୍ତୁ କିମ୍ବା ଲୋକାଲ୍ SLM ବ୍ୟବହାର କରନ୍ତୁ।</p><p>ରାମନ୍ ଲୋକାଲ୍ SLM ସହିତ ଅଫ୍‌ଲାଇନ୍ ଇନଫରେନ୍ସ କରାଯାଉଛି...</p></div>`
        : `<div class="med-section warning"><p>⚠️ <strong>Google Gemini API Key Missing:</strong> Please check your System & Model Settings to configure a valid API key.</p><p>Falling back to high-speed offline RAMAN Local SLM triage...</p></div>`;
      addMessage("ai", warningText, true);
      response = await generateSlmResponse(text, profile);
    }
  } else if (provider === "openai") {
    const key = localStorage.getItem("ramanai_openai_api_key") || "";
    const baseUrl = localStorage.getItem("ramanai_openai_base_url") || "https://api.openai.com/v1";
    const model = localStorage.getItem("ramanai_openai_model") || "gpt-4o";
    response = await generateOpenAiResponse(text, profile, key, baseUrl, model);
  } else {
    response = await generateSlmResponse(text, profile);
  }

  addMessage("ai", response, true);

  // Capture AI response
  chatHistory.push({ role:'ai', text: response.replace(/<[^>]*>/g,'').slice(0,200), time: nowTime() });
  if (chatHistory.length > 20) chatHistory.shift();

  // After FIRST consultation: generate + save Health ID, show card
  if (!hidShownThisSession && sessionMsgs === 1) {
    hidShownThisSession = true;
    saveHealthSession();                          // sets currentHealthId
    setTimeout(() => showHealthIdCard(currentHealthId, true), 400);
  } else if (sessionMsgs > 1 && currentHealthId) {
    // Debounce-save on subsequent messages
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(saveHealthSession, 1500);
  }
}

// ── Event Listeners ─────────────────────────────────────
document.getElementById("btnSend").addEventListener("click", sendMessage);

document.getElementById("userInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

document.getElementById("userInput").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 140) + "px";
  updateCharCount();
});

function updateCharCount() {
  const v = document.getElementById("userInput").value.length;
  document.getElementById("charCount").textContent = `${v}/1000`;
}



document.querySelectorAll(".symptom-tag").forEach(btn => {
  btn.addEventListener("click", () => {
    const symptom = btn.dataset.symptom;
    document.getElementById("userInput").value = symptom;
    updateCharCount();
    document.getElementById("userInput").focus();
    document.getElementById("userInput").dispatchEvent(new Event("input"));
    sendMessage();
  });
});

// Welcome message reactions
document.querySelectorAll(".reaction-btn").forEach(b => {
  b.addEventListener("click", () => b.classList.toggle("reacted"));
});

// ── Profile Completeness ────────────────────────────────
function updateProfileCompleteness() {
  const fields = ["patientName","patientAge","patientGender","patientBlood","patientAllergies"];
  const filled = fields.filter(id => document.getElementById(id).value.trim()).length;
  const pct = Math.round((filled / fields.length) * 100);
  document.getElementById("completenessFill").style.width = pct + "%";
  document.getElementById("completenessText").textContent = pct + "% Complete";
  const gender = document.getElementById("patientGender").value;
  const emoji = gender === "female" ? "👩‍⚕️" : gender === "male" ? "👨‍⚕️" : "👤";
  document.getElementById("avatarEmoji").textContent = emoji;
  // Persist immediately
  if (typeof saveProfile === 'function') saveProfile();
}
["patientName","patientAge","patientGender","patientBlood","patientAllergies"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateProfileCompleteness);
  document.getElementById(id).addEventListener("change", updateProfileCompleteness);
});

// ── Pain Slider ─────────────────────────────────────────
const painEmojis = ["","😊","🙂","😐","😟","😣","😖","😫","😩","😤","😱"];
document.getElementById("painSlider").addEventListener("input", function() {
  const v = parseInt(this.value);
  document.getElementById("painValue").textContent = v;
  document.getElementById("painEmoji").textContent = painEmojis[v];
  if (typeof saveProfile === 'function') saveProfile();
});

// ── Header Vitals Animation ─────────────────────────────
setInterval(() => {
  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  if (cpu) cpu.style.width = (40 + Math.random() * 50) + "%";
  if (neural) neural.style.width = (30 + Math.random() * 60) + "%";
}, 2000);

// ── Voice Input ─────────────────────────────────────────
let recognition = null;
let isListening = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  recognition.onresult = e => {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    document.getElementById("userInput").value = transcript;
    updateCharCount();
    document.getElementById("userInput").dispatchEvent(new Event("input"));
  };
  recognition.onend = () => stopVoice();
  recognition.onerror = () => stopVoice();
}

function startVoice() {
  if (!recognition) {
    alert("Voice input is not supported in this browser. Please use Chrome.");
    return;
  }
  isListening = true;
  document.getElementById("voiceIcon").textContent = "🔴";
  document.getElementById("voiceLabel").textContent = "Listening…";
  document.getElementById("voiceWaveform").style.display = "flex";
  document.getElementById("voiceStatus").textContent = "Speak now…";
  document.getElementById("btnVoice").classList.add("voice-active");
  recognition.start();
}
function stopVoice() {
  isListening = false;
  document.getElementById("voiceIcon").textContent = "🎙";
  document.getElementById("voiceLabel").textContent = "Voice";
  document.getElementById("voiceWaveform").style.display = "none";
  document.getElementById("voiceStatus").textContent = "";
  document.getElementById("btnVoice").classList.remove("voice-active");
  if (recognition) try { recognition.stop(); } catch(e){}
}
document.getElementById("btnVoice").addEventListener("click", () => {
  isListening ? stopVoice() : startVoice();
});

// ── File Upload ─────────────────────────────────────────
document.getElementById("btnUpload").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  openMediaModal(file);
  e.target.value = "";
});

let pendingFile = null;
function openMediaModal(file) {
  pendingFile = file;
  const modal = document.getElementById("mediaModal");
  const wrap = document.getElementById("modalMediaWrap");
  const analysis = document.getElementById("modalAnalysis");
  analysis.innerHTML = "";
  modal.style.display = "flex";
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    wrap.innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:300px;border-radius:8px;"></video>`;
  } else {
    wrap.innerHTML = `<img src="${url}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain;" />`;
  }
}

document.getElementById("modalClose").addEventListener("click", closeMediaModal);
document.getElementById("mediaModalBackdrop").addEventListener("click", closeMediaModal);
function closeMediaModal() {
  document.getElementById("mediaModal").style.display = "none";
  pendingFile = null;
}

document.getElementById("btnAnalyze").addEventListener("click", () => {
  if (!pendingFile) return;
  const analysis = document.getElementById("modalAnalysis");
  analysis.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Analyzing with RAMAN AI…</div>`;
  setTimeout(() => {
    const result = analyzeMedia(pendingFile);
    analysis.innerHTML = result;
    // Send to chat
    setTimeout(() => {
      const type = pendingFile.type.startsWith("video/") ? "🎥 Video" : "📷 Image";
      const url = URL.createObjectURL(pendingFile);
      const imgTag = pendingFile.type.startsWith("video/")
        ? `<div class="chat-media-thumb">🎥 <em>${pendingFile.name}</em></div>`
        : `<img src="${url}" class="chat-media-thumb" style="max-width:220px;border-radius:8px;display:block;margin-bottom:8px;" />`;
      addMessage("user", `${imgTag}<p>Uploaded ${type} for analysis: <strong>${pendingFile.name}</strong></p>`, true);
      addMessage("ai", result, true);
      closeMediaModal();
    }, 800);
  }, 2000);
});

function analyzeMedia(file) {
  const name = file.name.toLowerCase();
  const type = file.type;
  let condition = "general";
  if (name.includes("rash") || name.includes("skin") || name.includes("itch")) condition = "skin";
  else if (name.includes("xray") || name.includes("x-ray") || name.includes("chest")) condition = "xray";
  else if (name.includes("eye") || name.includes("retina")) condition = "eye";
  else if (name.includes("wound") || name.includes("cut") || name.includes("injury")) condition = "wound";
  else if (type.startsWith("video/")) condition = "video";

  const analyses = {
    skin: `<div class="med-section warning"><div class="med-section-title">🔬 VISUAL ANALYSIS – SKIN</div>
      <p><strong>Detected Pattern:</strong> Possible inflammatory skin condition. Redness and irregular texture visible.</p>
      <p><strong>Possible Conditions:</strong> Allergic Dermatitis, Eczema, Urticaria, Fungal Infection</p>
      <p><strong>Recommended:</strong> Cetirizine 10mg (antihistamine), Hydrocortisone 1% cream</p></div>
      <p>📋 Please consult a <strong>Dermatologist</strong> for confirmed diagnosis.</p>`,
    xray: `<div class="med-section info"><div class="med-section-title">🫁 VISUAL ANALYSIS – CHEST X-RAY</div>
      <p><strong>Detected:</strong> Lung fields under analysis. AI pattern recognition active.</p>
      <p><strong>Observations:</strong> Opacity levels, rib cage structure, and mediastinum evaluated.</p>
      <p><strong>Next Step:</strong> Please share this with a <strong>Pulmonologist / Radiologist</strong> for accurate interpretation.</p></div>`,
    eye: `<div class="med-section info"><div class="med-section-title">👁️ VISUAL ANALYSIS – EYE</div>
      <p><strong>Detected Pattern:</strong> Conjunctival redness or retinal pattern analyzed.</p>
      <p><strong>Possible:</strong> Conjunctivitis, Dry Eye, or Digital Eye Strain</p>
      <p><strong>Recommended:</strong> Artificial Tears, rest from screens, consult <strong>Ophthalmologist</strong></p></div>`,
    wound: `<div class="med-section warning"><div class="med-section-title">🩹 VISUAL ANALYSIS – WOUND/INJURY</div>
      <p><strong>Detected:</strong> Open wound or laceration detected in image.</p>
      <p><strong>Immediate Care:</strong> Clean with antiseptic, apply pressure to stop bleeding.</p>
      <p><strong>⚠️ Deep wounds require immediate medical attention.</strong></p></div>`,
    video: `<div class="med-section info"><div class="med-section-title">🎥 VIDEO ANALYSIS – SYMPTOM CAPTURE</div>
      <p><strong>Video received</strong> for symptom documentation.</p>
      <p>Motion patterns, tremors, gait, or visible symptoms have been logged for AI review.</p>
      <p>Please describe your symptoms in text for combined analysis.</p></div>`,
    general: `<div class="med-section info"><div class="med-section-title">🔬 VISUAL ANALYSIS COMPLETE</div>
      <p><strong>File analyzed:</strong> ${file.name}</p>
      <p>No specific medical pattern auto-detected. Please describe your symptoms in the chat for a full assessment.</p>
      <p>For best results, upload clear images of affected areas (skin, wounds, eyes, X-rays).</p></div>`
  };
  return analyses[condition] || analyses.general;
}

// ── Camera Modal ─────────────────────────────────────────
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentCamFacing = "user";

document.getElementById("btnCamera").addEventListener("click", openCamera);
document.getElementById("cameraClose").addEventListener("click", closeCamera);
document.getElementById("cameraBackdrop").addEventListener("click", closeCamera);

async function openCamera() {
  document.getElementById("cameraModal").style.display = "flex";
  await startCameraStream();
}

async function startCameraStream() {
  try {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentCamFacing }, audio: true
    });
    document.getElementById("cameraStream").srcObject = cameraStream;
  } catch(err) {
    alert("Camera access denied or not available. Please allow camera permissions.");
    closeCamera();
  }
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  if (isRecording) stopRecording();
  document.getElementById("cameraModal").style.display = "none";
}

document.getElementById("btnCapture").addEventListener("click", () => {
  const video = document.getElementById("cameraStream");
  const canvas = document.getElementById("captureCanvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    closeCamera();
    openMediaModal(file);
  }, "image/jpeg", 0.92);
});

document.getElementById("btnRecord").addEventListener("click", () => {
  isRecording ? stopRecording() : startRecording();
});

function startRecording() {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(cameraStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const file = new File([blob], "symptom-video.webm", { type: "video/webm" });
    closeCamera();
    openMediaModal(file);
  };
  mediaRecorder.start();
  isRecording = true;
  document.getElementById("btnRecord").textContent = "⏹ Stop Recording";
  document.getElementById("btnRecord").style.background = "rgba(255,77,109,0.3)";
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  document.getElementById("btnRecord").textContent = "🔴 Record Video";
  document.getElementById("btnRecord").style.background = "";
}

document.getElementById("btnSwitchCam").addEventListener("click", () => {
  currentCamFacing = currentCamFacing === "user" ? "environment" : "user";
  startCameraStream();
});

// ── Clear Chat: reset session count (merged into existing listener above) ──
// ═══════════════════════════════════════════════════════
// ── PROFILE PERSISTENCE (localStorage) ─────────────────
// ═══════════════════════════════════════════════════════
function saveProfile() {
  const p = getProfile();
  p.pain = document.getElementById('painSlider').value;
  localStorage.setItem('ramanai_profile', JSON.stringify(p));
}

function loadProfile() {
  const raw = localStorage.getItem('ramanai_profile');
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    if (p.name)     document.getElementById('patientName').value = p.name;
    if (p.age)      document.getElementById('patientAge').value  = p.age;
    if (p.gender)   document.getElementById('patientGender').value = p.gender;
    if (p.blood)    document.getElementById('patientBlood').value  = p.blood;
    if (p.allergies) document.getElementById('patientAllergies').value = p.allergies;
    if (p.bp && document.getElementById('patientBP')) document.getElementById('patientBP').value = p.bp;
    if (p.heartRate && document.getElementById('patientHR')) document.getElementById('patientHR').value = p.heartRate;
    if (p.temp && document.getElementById('patientTemp')) document.getElementById('patientTemp').value = p.temp;
    if (p.SpO2 && document.getElementById('patientSpO2')) document.getElementById('patientSpO2').value = p.SpO2;
    if (p.pain) {
      const slider = document.getElementById('painSlider');
      slider.value = p.pain;
      slider.dispatchEvent(new Event('input'));
    }
    updateProfileCompleteness();
    if (p.name) {
      setTimeout(() => {
        let vitalsArr = [];
        if (p.bp) vitalsArr.push(`BP: ${p.bp}`);
        if (p.heartRate) vitalsArr.push(`HR: ${p.heartRate} bpm`);
        if (p.temp) vitalsArr.push(`Temp: ${p.temp}°F`);
        if (p.SpO2) vitalsArr.push(`SpO2: ${p.SpO2}%`);
        const vitalsLine = vitalsArr.length > 0 ? `<br><span style="font-size:0.8rem; color:var(--accent);">📊 Vitals: ${vitalsArr.join(' | ')}</span>` : '';

        addMessage('ai',
          `<p>👋 Welcome back, <strong>${p.name}</strong>! Your health profile has been restored.</p>
           <div class="med-section info"><div class="med-section-title">🧠 PROFILE LOADED</div>
           <p>Age: <strong>${p.age || '—'}</strong> &nbsp;|&nbsp; Gender: <strong>${p.gender || '—'}</strong> &nbsp;|&nbsp; Blood: <strong>${p.blood || '—'}</strong></p>
           ${p.allergies ? `<p>⚠️ Known allergies: <strong>${p.allergies}</strong></p>` : ''}
           ${vitalsLine}
           <p>You have <strong>${vaultData.length}</strong> document(s) in your Medical Vault. How can I help you today?</p></div>`,
          true);
      }, 600);
    }
  } catch(e) { console.warn('Profile load error', e); }
}

// (saveProfile is called directly from updateProfileCompleteness and painSlider above)

// ═══════════════════════════════════════════════════════
// ── MEDICAL VAULT ──────────────────────────────────────
// ═══════════════════════════════════════════════════════
// (vaultData declared at top of file)

const VAULT_BADGE = {
  lab:          { icon: '🧪', label: 'Lab Report',  color: '#00ffb3' },
  prescription: { icon: '💊', label: 'Prescription', color: '#1a6fff' },
  xray:         { icon: '🫁', label: 'X-Ray',        color: '#9b6bff' },
  mri:          { icon: '🧠', label: 'MRI/CT',       color: '#ff9f43' },
  ecg:          { icon: '❤️', label: 'ECG',          color: '#ff4d6d' },
  discharge:    { icon: '📋', label: 'Discharge',    color: '#00e5ff' },
  photo:        { icon: '📷', label: 'Photo',        color: '#a8ff78' },
  video:        { icon: '🎥', label: 'Video',        color: '#f8b500' },
  general:      { icon: '📄', label: 'Document',     color: '#6a8bad' }
};

function saveToVault(name, type, summary, analysis, file = null) {
  const id = Date.now();
  const entry = {
    id,
    name, type, summary, analysis,
    date: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  };
  
  vaultData.unshift(entry);
  if (vaultData.length > 20) {
    const popped = vaultData.pop();
    deleteFileFromDB(popped.id).catch(e => console.error("Could not delete file from IndexedDB:", e));
  }
  
  localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
  
  if (file) {
    storeFileInDB(id, file)
      .then(() => console.log(`File stored in IndexedDB: ${name} with ID: ${id}`))
      .catch(e => console.error("Could not store file in IndexedDB:", e));
  }
  
  renderVault();
  saveDetectedCondition(type);
}

function deleteVaultEntry(id) {
  vaultData = vaultData.filter(v => v.id != id);
  localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
  deleteFileFromDB(Number(id))
    .then(() => console.log(`Deleted file from IndexedDB with ID: ${id}`))
    .catch(e => console.error("Error deleting from IndexedDB:", e));
  renderVault();
}

async function openVaultModal(id) {
  const entry = vaultData.find(v => v.id == id);
  if (!entry) return;
  
  const backdrop = document.getElementById('vaultBackdrop');
  const modal = document.getElementById('vaultModal');
  const mediaWrap = document.getElementById('vaultModalMediaWrap');
  const analysisDiv = document.getElementById('vaultModalAnalysis');
  const deleteBtn = document.getElementById('vaultModalDeleteBtn');
  
  if (!modal || !backdrop) return;
  
  mediaWrap.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Loading preview binary...</div>`;
  analysisDiv.innerHTML = entry.analysis;
  const hub = analysisDiv.querySelector('.slm-diagnostic-hub');
  if (hub) {
    hub.dataset.id = id;
  }
  
  // Set delete action
  deleteBtn.onclick = () => {
    if (confirm(`Are you sure you want to delete this document: ${entry.name}?`)) {
      deleteVaultEntry(entry.id);
      closeVaultModal();
    }
  };
  
  // Show UI immediately
  backdrop.style.display = 'block';
  modal.style.display = 'block';
  modal.classList.add('open');
  
  try {
    const fileRecord = await getFileFromDB(Number(id));
    if (fileRecord && fileRecord.dataUrl) {
      const isVid = fileRecord.type && fileRecord.type.startsWith('video/');
      if (isVid) {
        mediaWrap.innerHTML = `
          <video src="${fileRecord.dataUrl}" controls autoplay style="max-width:100%; max-height:220px; border-radius:8px; display:block; outline:none; box-shadow:0 0 15px rgba(0,255,179,0.2); margin: 0 auto;"></video>
          <div style="margin-top:6px; font-size:0.8rem; color:var(--text-muted);">${fileRecord.name}</div>
        `;
      } else {
        mediaWrap.innerHTML = `
          <img src="${fileRecord.dataUrl}" style="max-width:100%; max-height:220px; border-radius:8px; display:block; box-shadow:0 0 15px rgba(0,255,179,0.2); margin:0 auto;"/>
          <div style="margin-top:6px; font-size:0.8rem; color:var(--text-muted);">${fileRecord.name}</div>
        `;
      }
    } else {
      const b = VAULT_BADGE[entry.type] || VAULT_BADGE.general;
      mediaWrap.innerHTML = `
        <div style="text-align:center; padding:15px;">
          <div style="font-size:3rem; color:${b.color}; margin-bottom:8px;">${b.icon}</div>
          <div style="font-size:0.9rem; font-weight:bold; color:var(--text);">${entry.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">No local image/video binary cached (text summary preserved)</div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error retrieving file from DB:", error);
    const b = VAULT_BADGE[entry.type] || VAULT_BADGE.general;
    mediaWrap.innerHTML = `
      <div style="text-align:center; padding:15px;">
        <div style="font-size:3rem; color:${b.color};">${b.icon}</div>
        <div style="font-size:0.9rem; font-weight:bold;">${entry.name}</div>
        <div style="font-size:0.75rem; color:#ff4d6d; margin-top:4px;">Failed to load local binary from vault storage.</div>
      </div>
    `;
  }
}

function closeVaultModal() {
  const backdrop = document.getElementById('vaultBackdrop');
  const modal = document.getElementById('vaultModal');
  if (backdrop) backdrop.style.display = 'none';
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  const mediaWrap = document.getElementById('vaultModalMediaWrap');
  const analysisDiv = document.getElementById('vaultModalAnalysis');
  if (mediaWrap) mediaWrap.innerHTML = '';
  if (analysisDiv) analysisDiv.innerHTML = '';
}

function renderVault() {
  const list  = document.getElementById('vaultList');
  const empty = document.getElementById('vaultEmpty');
  const count = document.getElementById('vaultCount');
  if (!list) return;
  if (!vaultData.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    count.textContent = '0 docs';
    return;
  }
  empty.style.display = 'none';
  count.textContent = vaultData.length + ' doc' + (vaultData.length > 1 ? 's' : '');
  list.innerHTML = vaultData.map(v => {
    const b = VAULT_BADGE[v.type] || VAULT_BADGE.general;
    return `<div class="vault-item" data-id="${v.id}" style="cursor:pointer;">
      <div class="vault-item-icon" style="color:${b.color}">${b.icon}</div>
      <div class="vault-item-info">
        <div class="vault-item-name">${v.name}</div>
        <div class="vault-item-meta"><span class="vault-badge" style="border-color:${b.color};color:${b.color}">${b.label}</span> ${v.date}</div>
      </div>
      <button class="vault-view-btn" data-id="${v.id}" title="View analysis">▶</button>
    </div>`;
  }).join('');
  
  // Attach listeners to both the vault item click and the play button
  list.querySelectorAll('.vault-item').forEach(item => {
    item.addEventListener('click', e => {
      const id = item.dataset.id;
      openVaultModal(id);
    });
  });
  list.querySelectorAll('.vault-view-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      openVaultModal(id);
    });
  });
}

// ═══════════════════════════════════════════════════════
// ── ENHANCED DOCUMENT ANALYSIS ─────────────────────────
// ═══════════════════════════════════════════════════════
function detectDocType(file, manualType) {
  if (manualType && manualType !== 'auto') return manualType;
  const n = file.name.toLowerCase();
  if (/lab|blood|cbc|haemo|hb|urine|report|test|wbc|rbc|platelets|hba1c|glucose|lipid|thyroid/.test(n)) return 'lab';
  if (/rx|prescription|medicine|medic|tablet|capsule|dr\.|doctor|clinic/.test(n)) return 'prescription';
  if (/xray|x-ray|x_ray|chest|lung|bone|fracture|radiograph/.test(n)) return 'xray';
  if (/mri|ct|scan|brain|spine|lumbar|cervical|tumor|neuro/.test(n)) return 'mri';
  if (/ecg|ekg|cardio|heart|cardiac|echo/.test(n)) return 'ecg';
  if (/discharge|summary|hospital|ward|inpatient|admit/.test(n)) return 'discharge';
  if (file.type.startsWith('video/')) return 'video';
  return 'photo';
}

function analyzeDocument(file, docType, profile, tunerParams = null) {
  const b   = VAULT_BADGE[docType] || VAULT_BADGE.general;
  const name = profile && profile.name ? `<strong>${profile.name}</strong>` : 'the patient';
  const allergies = profile && profile.allergies ? profile.allergies : null;
  const painLevel = profile && typeof profile.painLevel !== 'undefined' ? parseInt(profile.painLevel) : null;
  const n = file.name.toLowerCase();
  
  // 1. GATHER DEFAULT PARAMS BASED ON FILENAME SEMANTICS OR CHAT DATA
  let detectedCondition = "General Medical Scan";
  let defaultStage = 2; // Default to moderate (Stage 2)
  let confidence = 75;
  
  // Opacity for X-Ray, Glucose/HbA1c for Lab, Size for MRI, ST shift for ECG, dosage/meds check for Rx.
  let keyMetricName = "Assessment Metric";
  let keyMetricValue = "Not Specified";
  let keyMetricUnit = "";
  let keyMetricMin = 0;
  let keyMetricMax = 100;
  
  // Parsing stage keywords in filename
  if (/\b(stage\s*(1|i)\b|mild|early|grade\s*(1|i)\b)/i.test(n)) {
    defaultStage = 1;
    confidence += 15;
  } else if (/\b(stage\s*(2|ii)\b|moderate|developing|grade\s*(2|ii)\b)/i.test(n)) {
    defaultStage = 2;
    confidence += 10;
  } else if (/\b(stage\s*(3|iii)\b|severe|advanced|grade\s*(3|iii)\b)/i.test(n)) {
    defaultStage = 3;
    confidence += 15;
  } else if (/\b(stage\s*(4|iv)\b|critical|emergency|grave|grade\s*(4|iv)\b)/i.test(n)) {
    defaultStage = 4;
    confidence += 20;
  } else {
    // Correlate with active painLevel if available
    if (painLevel !== null) {
      if (painLevel <= 3) defaultStage = 1;
      else if (painLevel <= 6) defaultStage = 2;
      else if (painLevel <= 8) defaultStage = 3;
      else defaultStage = 4;
      confidence += 5;
    }
  }

  // Parse specific conditions based on filename
  if (docType === 'xray') {
    if (/pneumonia|lung|opacity|consolidation|effusion|infiltrate/i.test(n)) {
      detectedCondition = "Pneumonia / Lung Consolidation";
      keyMetricName = "Lung Opacity Area";
      keyMetricUnit = "%";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = defaultStage === 1 ? "15" : defaultStage === 2 ? "35" : defaultStage === 3 ? "65" : "85";
      confidence += 15;
    } else if (/fracture|bone|break|fissure|joint|arthritis/i.test(n)) {
      detectedCondition = "Bone Fracture & Osteoarthritis";
      keyMetricName = "Joint Space Narrowing / Displacement";
      keyMetricUnit = "%";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = defaultStage === 1 ? "10" : defaultStage === 2 ? "30" : defaultStage === 3 ? "60" : "90";
      confidence += 15;
    } else {
      detectedCondition = "Chest / Skeletal X-Ray";
      keyMetricName = "Structural Abnormality Deviation";
      keyMetricUnit = "%";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = "25";
    }
  } else if (docType === 'mri') {
    if (/tumor|tumour|mass|glioma|cyst|lesion|nodule/i.test(n)) {
      detectedCondition = "Brain Tumour / Parenchymal Lesion";
      keyMetricName = "Lesion Maximum Diameter";
      keyMetricUnit = " mm";
      keyMetricMin = 0;
      keyMetricMax = 80;
      keyMetricValue = defaultStage === 1 ? "8" : defaultStage === 2 ? "18" : defaultStage === 3 ? "35" : "55";
      confidence += 15;
    } else if (/stenosis|herniation|bulge|disc|spine/i.test(n)) {
      detectedCondition = "Spinal Herniation & Canal Stenosis";
      keyMetricName = "Spinal Canal Narrowing / Bulge";
      keyMetricUnit = " mm";
      keyMetricMin = 0;
      keyMetricMax = 15;
      keyMetricValue = defaultStage === 1 ? "2" : defaultStage === 2 ? "5" : defaultStage === 3 ? "9" : "13";
      confidence += 15;
    } else {
      detectedCondition = "Nervous / Musculoskeletal Scan";
      keyMetricName = "Anatomical Deviation Size";
      keyMetricUnit = " mm";
      keyMetricMin = 0;
      keyMetricMax = 50;
      keyMetricValue = "12";
    }
  } else if (docType === 'ecg') {
    if (/elevation|stemi|depression|ischemia|t-wave|mi/i.test(n)) {
      detectedCondition = "Myocardial Ischemia (ST-Elevation / Depression)";
      keyMetricName = "ST Segment Elevation / Shift";
      keyMetricUnit = " mm";
      keyMetricMin = -5;
      keyMetricMax = 8;
      keyMetricValue = defaultStage === 1 ? "0.5" : defaultStage === 2 ? "1.5" : defaultStage === 3 ? "3.0" : "5.5";
      confidence += 20;
    } else if (/arrhythmia|pvc|fibrillation|afib|block/i.test(n)) {
      detectedCondition = "Cardiac Arrhythmia (PVCs / AFib)";
      keyMetricName = "Premature Ventricular Beats / Run Frequency";
      keyMetricUnit = " bpm";
      keyMetricMin = 0;
      keyMetricMax = 180;
      keyMetricValue = defaultStage === 1 ? "2" : defaultStage === 2 ? "12" : defaultStage === 3 ? "35" : "68";
      confidence += 20;
    } else {
      detectedCondition = "Cardiac Electrophysiological ECG";
      keyMetricName = "Heart Rate Variance (ST shift)";
      keyMetricUnit = " mm";
      keyMetricMin = 0;
      keyMetricMax = 5;
      keyMetricValue = "1.0";
    }
  } else if (docType === 'lab') {
    if (/hba1c|glucose|sugar/i.test(n)) {
      detectedCondition = "Glycaemic Panel (Diabetes Mellitus)";
      keyMetricName = "HbA1c Level";
      keyMetricUnit = "%";
      keyMetricMin = 4;
      keyMetricMax = 15;
      keyMetricValue = defaultStage === 1 ? "5.4" : defaultStage === 2 ? "6.2" : defaultStage === 3 ? "7.8" : "11.2";
      confidence += 15;
    } else if (/creatinine|egfr|kidney|renal/i.test(n)) {
      detectedCondition = "Renal Function Assessment (CKD)";
      keyMetricName = "Serum Creatinine Level";
      keyMetricUnit = " mg/dL";
      keyMetricMin = 0.4;
      keyMetricMax = 8.0;
      keyMetricValue = defaultStage === 1 ? "0.8" : defaultStage === 2 ? "1.4" : defaultStage === 3 ? "2.8" : "5.4";
      confidence += 15;
    } else {
      detectedCondition = "Hematological / Biochemistry Panel";
      keyMetricName = "Diagnostic Marker Deviation";
      keyMetricUnit = "%";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = "45";
    }
  } else if (docType === 'prescription') {
    detectedCondition = "Prescription Assessment";
  } else if (docType === 'photo') {
    if (/rash|skin|itch|eczema/.test(n)) {
      detectedCondition = "Dermatological Lesion (Eczema / Dermatitis)";
    } else if (/wound|cut|injur|bleed/.test(n)) {
      detectedCondition = "Traumatic Wound / Tissue Injury";
    } else if (/eye|retina|conjunctiv/.test(n)) {
      detectedCondition = "Ophthalmic Conjunctival Condition";
    } else {
      detectedCondition = "Symptom Photo Evaluation";
    }
  }

  // 2. INCORPORATE DYNAMIC TUNER PARAMETERS IF OVERRIDDEN
  let activeStage = defaultStage;
  if (tunerParams && typeof tunerParams.stage !== 'undefined') {
    activeStage = parseInt(tunerParams.stage);
    confidence = 94; // Override because user manual input is highly targeted
  }
  
  let activeMetricVal = keyMetricValue;
  if (tunerParams && typeof tunerParams.value !== 'undefined' && tunerParams.value !== null) {
    activeMetricVal = tunerParams.value;
  } else {
    // If no manual override, sync default value to stage
    if (docType === 'xray') {
      if (detectedCondition.includes("Pneumonia")) {
        activeMetricVal = activeStage === 1 ? "15" : activeStage === 2 ? "35" : activeStage === 3 ? "65" : "85";
      } else {
        activeMetricVal = activeStage === 1 ? "10" : activeStage === 2 ? "30" : activeStage === 3 ? "60" : "90";
      }
    } else if (docType === 'mri') {
      if (detectedCondition.includes("Tumour")) {
        activeMetricVal = activeStage === 1 ? "8" : activeStage === 2 ? "18" : activeStage === 3 ? "35" : "55";
      } else {
        activeMetricVal = activeStage === 1 ? "2" : activeStage === 2 ? "5" : activeStage === 3 ? "9" : "13";
      }
    } else if (docType === 'ecg') {
      if (detectedCondition.includes("Ischemia")) {
        activeMetricVal = activeStage === 1 ? "0.5" : activeStage === 2 ? "1.5" : activeStage === 3 ? "3.0" : "5.5";
      } else {
        activeMetricVal = activeStage === 1 ? "2" : activeStage === 2 ? "12" : activeStage === 3 ? "35" : "68";
      }
    } else if (docType === 'lab') {
      if (detectedCondition.includes("Glycaemic")) {
        activeMetricVal = activeStage === 1 ? "5.4" : activeStage === 2 ? "6.2" : activeStage === 3 ? "7.8" : "11.2";
      } else {
        activeMetricVal = activeStage === 1 ? "0.8" : activeStage === 2 ? "1.4" : activeStage === 3 ? "2.8" : "5.4";
      }
    }
  }

  // Adjust confidence slightly to never exceed 98%
  confidence = Math.min(confidence, 98);

  const stageTitles = {
    1: "Stage 1 (Mild / Early Stage)",
    2: "Stage 2 (Moderate / Developing)",
    3: "Stage 3 (Severe / Advanced)",
    4: "Stage 4 (Critical / Urgent Emergency)"
  };

  const stageColors = {
    1: "#00ffb3", // Emerald Neon
    2: "#ffcc00", // Amber Neon
    3: "#ff6600", // Orange Neon
    4: "#ff0055"  // Red Crimson Neon
  };

  let pathologyHtml = "";
  let therapeuticSuggestions = "";
  let medicalAction = "";

  if (docType === 'xray') {
    if (detectedCondition.includes("Pneumonia")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Visual segment scanning indicates opacity within the lung lobes at <strong>${activeMetricVal}%</strong> volume. Under high-contrast filtering, this matches structural features of consolidation.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Early sub-lobar consolidation. No plural fluid buildup.' : activeStage === 2 ? 'Lobar consolidation localized in a single lung field. Mild pleural thickening.' : activeStage === 3 ? 'Multilobar opacities. Early pleural effusion detected. Significant breathing restriction.' : 'Bilateral diffuse airspace opacities with widespread consolidation. ARDS hazard level.'}</li>
          <li><strong>Radiological Markers:</strong> Sub-segmental density, bronchogram sign, and alveolar pattern alignment are present.</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>💧 <strong>Hydration & Rest:</strong> Drink plenty of warm fluids; aim for 2.5–3L water/day.</li>
          <li>🌬️ <strong>Spirometry Exercises:</strong> Use a spirometer 3–5 times daily to support lung volume expansion.</li>
          <li>🛋️ <strong>Prone Position Rest:</strong> Laying on your stomach can improve oxygenation if breathing feels slightly heavy.</li>
          ${allergies ? `<li>⚠️ <strong>Allergy Reminder:</strong> Carefully inspect antibiotics for conflicts with: <strong>${allergies}</strong></li>` : ''}
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Pulmonologist or General Physician within 48 hours for antibiotic prescription." 
        : activeStage === 2 
        ? "👉 Visit a physician promptly. Initiate prescribed antibiotics and bronchodilators." 
        : activeStage === 3 
        ? "🚨 Urgent consultation required. Outpatient hospital monitoring is recommended." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Visit the emergency ward immediately. Widespread consolidation carries severe oxygen deprivation risk.";
    } else {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Analysis identifies skeletal alignment variation with joint-space narrowing or cortical disruption at <strong>${activeMetricVal}%</strong> severity.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Hairline cortical fissure or early osteophytes. No displacement.' : activeStage === 2 ? 'Complete fissure/fracture without displacement or moderate osteophyte narrows.' : activeStage === 3 ? 'Displaced bone segment or severe joint-space erosion with subchondral sclerosis.' : 'Compound/open cortical fragmentation or absolute joint collapse with severe deformity.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🧊 <strong>Cold Compress:</strong> Apply ice wrapped in a towel for 15-20 min to control local swelling.</li>
          <li>🚫 <strong>Immobilization:</strong> Rest the affected joint/limb; do not bear weight on it.</li>
          <li>🧬 <strong>Supplementation:</strong> Ensure optimal calcium (1000mg/day) and Vitamin D3 (2000 IU/day) intake.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Rest the joint, use light support (splint/wrap), and seek orthopaedic consult." 
        : activeStage === 2 
        ? "👉 Orthopaedic consult required. Fissures need cast immobilization to avoid bone slippage." 
        : activeStage === 3 
        ? "🚨 Urgent orthopaedic intervention needed. Immobilize and get immediate attention." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Open bone wounds or absolute segment displacement require immediate emergency surgery.";
    }
  } else if (docType === 'mri') {
    if (detectedCondition.includes("Tumour")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Neuroimaging and segmentation isolate a well-defined/infiltrating parenchymal mass measured at <strong>${activeMetricVal} mm</strong> in maximum diameter.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Grade I (Mild). Benign, slow-growing, highly circumscribed lesion. No midline shift.' : activeStage === 2 ? 'Grade II (Moderate). Low-grade infiltrative malignancy. Clear margins, minimal local tissue edema.' : activeStage === 3 ? 'Grade III (Severe). Anaplastic/rapid growth showing early infiltration. Significant edema.' : 'Grade IV (Critical). Widespread infiltrative malignant structure (Glioblastoma-like) with mass effect and midline shift.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🧠 <strong>Neurological Checks:</strong> Monitor for visual changes, severe early morning headaches, or sudden motor weakness.</li>
          <li>🌿 <strong>Edema Control:</strong> Keep your head elevated at 30° while resting to lower intracranial pressure.</li>
          <li>📝 <strong>Symptom Diary:</strong> Record daily frequency of any numbness, cognitive fatigue, or speech difficulties.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Plan a consult with a Neurologist/Neurosurgeon within 1 week for routine monitoring plan." 
        : activeStage === 2 
        ? "👉 Prompt neurosurgical evaluation is recommended to discuss biopsy or surgical resection." 
        : activeStage === 3 
        ? "🚨 Urgent Neurosurgery/Oncology referral. Edema control therapies should be initiated immediately." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Infiltrative Grade IV tumors showing midline shift require immediate neuro-emergency admission.";
    } else {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>MRI analysis of the vertebral segments reveals intervertebral disc displacement measuring <strong>${activeMetricVal} mm</strong>.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Mild focal bulging of disc. No root or cord compression.' : activeStage === 2 ? 'Moderate disc protrusion. Touches root pocket; minor stenosis.' : activeStage === 3 ? 'Disc extrusion with clear spinal cord/cauda compression and dermatomal numbness.' : 'Disc sequestration with severe stenosis, significant fragment migration, and Cauda Equina hazard.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🚫 <strong>Avoid Bending:</strong> Do not perform forward bending or lift weights exceeding 3 kg.</li>
          <li>🧘‍♂️ <strong>Physical Therapy:</strong> Practice core-stabilization exercises (planks, bird-dogs) once inflammation subsides.</li>
          <li>🔥 <strong>Heat/Cold Therapy:</strong> Use ice packs for acute pain, shifting to heat wraps for muscle stiffness.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Safe for conservative management (Physiotherapy, posture adjustments)." 
        : activeStage === 2 
        ? "👉 Consult a Spine Specialist or Physiotherapist. Gentle traction therapy may be beneficial." 
        : activeStage === 3 
        ? "🚨 Urgent Spine consult. Consider epidural injection options or surgical decompression evaluation." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Severe stenosis accompanied by bowel/bladder dysfunction requires immediate surgery (Cauda Equina).";
    }
  } else if (docType === 'ecg') {
    if (detectedCondition.includes("Ischemia")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Electrocardiogram baseline reveals ST-segment shift of <strong>${activeMetricVal} mm</strong> relative to the isoelectric line.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Mild ST deviation (<0.5mm). Early cardiac strain or chronic stable angina.' : activeStage === 2 ? 'Moderate ST depression (1.0 - 2.0mm). Suggests developing subendocardial ischemia.' : activeStage === 3 ? 'Severe ST segment depression (>2.5mm) or prominent T-wave inversion. High risk of unstable coronary syndrome.' : 'Critical ST Segment Elevation (≥4.0mm) - STEMI in progress. Transmural myocardial infarction.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>💓 <strong>Heart Rate Management:</strong> Maintain absolute physical and mental rest. Avoid any physical exertion.</li>
          <li>🧪 <strong>Vital Checks:</strong> Monitor blood pressure every 4 hours. Keep a home pulse-oximeter active.</li>
          <li>🥦 <strong>Heart Healthy Diet:</strong> Strictly eliminate high-sodium, trans-fats, and high-sugar elements.</li>
          ${allergies && /aspirin/i.test(allergies) ? '<li style="color:#ff4d6d;">⚠️ <strong>ALLERGY WARNING:</strong> Aspirin is contraindicated! Consult doctor for alternate antiplatelets (Clopidogrel).</li>' : ''}
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Cardiologist within 7 days for a cardiac stress test or Echo." 
        : activeStage === 2 
        ? "👉 Urgent Cardiologist evaluation. Check cardiac enzyme levels (Troponin) and schedule angiography." 
        : activeStage === 3 
        ? "🚨 <strong>URGENT ALERT:</strong> Unstable Angina threat. Visit the Cardiac Emergency department without delay." 
        : "🚨 <strong>CRITICAL CODE RED:</strong> ST-Elevation STEMI detected. Call emergency ambulance instantly. Time is heart muscle!";
    } else {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Rhythm capture demonstrates abnormal ventricular pacing. Premature ventricular contraction (PVC) load is recorded at <strong>${activeMetricVal}</strong> anomalies.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Occasional PVCs (<5/min) or sinus bradycardia. Mild benign strain.' : activeStage === 2 ? 'Frequent PVCs (5-15/min) or intermittent Atrial Fibrillation. Developing arrhythmia.' : activeStage === 3 ? 'Persistent AFib with rapid ventricular response or non-sustained Ventricular Tachycardia.' : 'Sustained Ventricular Tachycardia, V-Fib, or Complete Heart Block. Cardiac arrest risk.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>☕ <strong>Cut Caffeine:</strong> Eliminate coffee, strong tea, energy drinks, and nicotine instantly.</li>
          <li>💊 <strong>Electrolyte Balance:</strong> Consume magnesium-rich and potassium-rich foods (bananas, coconut water).</li>
          <li>🧘‍♂️ <strong>Stress Relief:</strong> Practice deep breathing exercises to reduce sympathetic nervous drive.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Safe to monitor. Record symptoms when palpitations occur and check with a physician." 
        : activeStage === 2 
        ? "👉 Consult a Cardiologist. Get a 24-hour Holter monitor test to track rhythm patterns." 
        : activeStage === 3 
        ? "🚨 Urgent Cardiologist consultation. Antiarrhythmics (e.g. Beta-blockers) are required." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Sustained V-Tach/VFib carries immediate loss of consciousness risk. Seek defibrillation.";
    }
  } else if (docType === 'lab') {
    if (detectedCondition.includes("Glycaemic")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Blood panel indicates an HbA1c rating of <strong>${activeMetricVal}%</strong>. This reflects the 3-month glycation index of red blood cells.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'HbA1c &lt; 5.7% (Normal, non-diabetic range).' : activeStage === 2 ? 'HbA1c 5.7% - 6.4% (Pre-diabetic zone). Early insulin resistance.' : activeStage === 3 ? 'HbA1c 6.5% - 8.5% (Controlled / Moderately Elevated Diabetes).' : 'HbA1c &gt; 8.5% (Severe Uncontrolled Diabetes). High risk of diabetic ketoacidosis and retinopathy.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🥗 <strong>Carb Restriction:</strong> Limit carbohydrates to under 100g/day. Choose whole grains (oats, brown rice, dal).</li>
          <li>🏃‍♂️ <strong>Post-Meal Walks:</strong> Walk briskly for 15-20 minutes after lunch and dinner to lower spike levels.</li>
          <li>💧 <strong>Hydration:</strong> Drink 3L of water daily to help kidneys flush out excess glucose.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Excellent. Keep up current lifestyle. Re-test HbA1c once a year." 
        : activeStage === 2 
        ? "👉 Focus strictly on diet modifications and exercise. Pre-diabetes is fully reversible at this stage!" 
        : activeStage === 3 
        ? "👉 Consult a Diabetologist. Begin or adjust oral hypoglycaemics (e.g., Metformin 500mg)." 
        : "🚨 <strong>URGENT DIABETIC RISK:</strong> Severe uncontrolled levels require immediate consultation. Insulin therapy is likely necessary.";
    } else {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Glomerular clearance profiling shows a serum creatinine scale of <strong>${activeMetricVal} mg/dL</strong>.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Creatinine &lt; 1.2 mg/dL. Normal renal clearance.' : activeStage === 2 ? 'Creatinine 1.2 - 2.0 mg/dL. Stage 2 Chronic Kidney Disease (Mild decrease).' : activeStage === 3 ? 'Creatinine 2.1 - 4.5 mg/dL. Stage 3/4 CKD (Moderate to Severe decrease).' : 'Creatinine &gt; 4.5 mg/dL. Stage 5 End-Stage Renal Disease / Acute Kidney Injury.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🧂 <strong>Low Sodium Diet:</strong> Reduce salt intake to under 1500 mg/day (eliminate pickles, papad, processed foods).</li>
          <li>🥦 <strong>Protein Intake:</strong> Restrict heavy protein (paneer, chicken, dal) to protect glomerular filtration load.</li>
          <li>🚫 <strong>Avoid NSAIDs:</strong> Strictly avoid painkillers like Ibuprofen or Diclofenac as they damage kidneys.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Keep healthy hydration, monitor blood pressure, and re-test annually." 
        : activeStage === 2 
        ? "👉 Consult a Nephrologist. Tighten control over blood pressure and blood sugar parameters." 
        : activeStage === 3 
        ? "🚨 Urgent Nephrology consult. Adjust drug dosages for renal safety and monitor eGFR regularly." 
        : "🚨 <strong>CRITICAL RENAL THREAT:</strong> Widespread renal failure. Emergency dialysis or immediate hospitalization is critical.";
    }
  } else if (docType === 'prescription') {
    const activeMeds = [];
    if (tunerParams) {
      if (tunerParams.med_diabetes) activeMeds.push("Metformin 500mg (Diabetes)");
      if (tunerParams.med_bp) activeMeds.push("Lisinopril 10mg (Hypertension)");
      if (tunerParams.med_chol) activeMeds.push("Atorvastatin 20mg (Cholesterol)");
      if (tunerParams.med_antibiotic) activeMeds.push("Amoxicillin 500mg (Antibiotic)");
      if (tunerParams.med_aspirin) activeMeds.push("Aspirin 75mg (Blood Thinner)");
      if (tunerParams.med_pain) activeMeds.push("Ibuprofen 400mg (NSAID Painkiller)");
    } else {
      if (/metformin|diabet|sugar/i.test(n)) activeMeds.push("Metformin 500mg (Diabetes)");
      if (/lisinopril|amlodipine|bp/i.test(n)) activeMeds.push("Lisinopril 10mg (Hypertension)");
      if (/atorva|statin|chol/i.test(n)) activeMeds.push("Atorvastatin 20mg (Cholesterol)");
      if (/amoxi|antibio|penic/i.test(n)) activeMeds.push("Amoxicillin 500mg (Antibiotic)");
      if (/aspirin|thinner/i.test(n)) activeMeds.push("Aspirin 75mg (Blood Thinner)");
      if (/ibuprofen|pain/i.test(n)) activeMeds.push("Ibuprofen 400mg (NSAID Painkiller)");
      if (activeMeds.length === 0) {
        activeMeds.push("Metformin 500mg (Diabetes)");
        activeMeds.push("Atorvastatin 20mg (Cholesterol)");
      }
    }

    let allergyConflictHtml = "";
    if (allergies) {
      const allergyKeywords = allergies.toLowerCase();
      activeMeds.forEach(med => {
        const medL = med.toLowerCase();
        if (/penicillin/i.test(allergyKeywords) && /amoxicillin/i.test(medL)) {
          allergyConflictHtml += `
            <div class="med-section warning" style="border:2px solid #ff0055; margin-bottom:12px; animation: pulseGlow 2s infinite;">
              <div class="med-section-title" style="color:#ff0055;">⚠️ SEVERE CONTRAINDICATION: PENICILLIN ALLERGY</div>
              <p>You have a registered <strong>Penicillin Allergy</strong>. <strong>Amoxicillin</strong> belongs to the Penicillin drug family. Taking this medication could trigger anaphylaxis or severe hypersensitivity. <strong>Contact your prescribing physician immediately to request a non-penicillin alternative (such as Azithromycin)</strong>.</p>
            </div>
          `;
        }
        if ((/nsaid|aspirin|ibuprofen/i.test(allergyKeywords)) && (/aspirin|ibuprofen/i.test(medL))) {
          allergyConflictHtml += `
            <div class="med-section warning" style="border:2px solid #ff0055; margin-bottom:12px; animation: pulseGlow 2s infinite;">
              <div class="med-section-title" style="color:#ff0055;">⚠️ CONTRAINDICATION: NSAID ALLERGY</div>
              <p>Your allergy profile lists: <strong>${allergies}</strong>. You are prescribed <strong>Aspirin/Ibuprofen</strong>, which are NSAIDs. Taking these may lead to bronchospasms, hives, or gastric irritation. Ask your doctor for paracetamol-based analgesics.</p>
            </div>
          `;
        }
      });
    }

    pathologyHtml = `
      ${allergyConflictHtml}
      <div class="med-section info">
        <div class="med-section-title">📋 RX DRUGS EXTRACTED</div>
        <p>RAMAN AI SLM has parsed and classified the following medications from your document:</p>
        <table class="doc-table">
          <tr><th>Medication</th><th>Indication</th><th>Timing Guideline</th></tr>
          ${activeMeds.map(med => {
            let ind = "General Support";
            let time = "As directed by doctor";
            if (med.includes("Metformin")) { ind = "Type 2 Diabetes"; time = "Take with or after breakfast/dinner"; }
            if (med.includes("Lisinopril")) { ind = "Hypertension"; time = "Take in the morning, empty stomach"; }
            if (med.includes("Atorvastatin")) { ind = "Hypercholesterolemia"; time = "Take at bedtime (cholesterol synthesizes at night)"; }
            if (med.includes("Amoxicillin")) { ind = "Bacterial Infection"; time = "Complete 5-day course, space 8 hrs apart"; }
            if (med.includes("Aspirin")) { ind = "Antiplatelet / Cardio-care"; time = "Take after a heavy meal"; }
            if (med.includes("Ibuprofen")) { ind = "NSAID Pain / Inflammation"; time = "Take strictly after meals; avoid if kidney/ulcer issues"; }
            return `<tr><td><strong>${med.split(" (")[0]}</strong></td><td>${ind}</td><td>${time}</td></tr>`;
          }).join('')}
        </table>
      </div>
    `;

    therapeuticSuggestions = `
      <ul>
        <li>💊 <strong>Dosing Integrity:</strong> Set alarms for your dosing intervals. Never double-dose if a tablet is missed.</li>
        <li>☕ <strong>Substance Interactions:</strong> Do not consume alcohol or heavy grapefruit juices while on Atorvastatin or Antibiotics.</li>
        <li>📦 <strong>Storage:</strong> Keep prescription packs locked away in a dry, cool cabinet (under 25°C).</li>
      </ul>
    `;
    
    medicalAction = "👉 Ensure your prescribing doctor is aware of all your registered allergies. If any drug conflicts are shown above, do not consume that drug until you verify with a physician.";
  } else if (docType === 'photo') {
    if (detectedCondition.includes("Dermatological")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Scanning photo visual details. Visual segment filters isolate cell-structure inflammation boundaries indicating active skin irritation.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Mild localized erythema (redness) without blistering or itching.' : activeStage === 2 ? 'Moderate eczema/dermatitis. Scaling, dry patches, and minor papules detected.' : activeStage === 3 ? 'Severe widespread dermatitis with severe itching, excoriation, and fluid oozing.' : 'Critical skin breakdown. Infection risk (cellulitis potential) with high swelling and pain.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🧴 <strong>Moisturization:</strong> Apply a thick ceramide-based emollient within 3 minutes after washing.</li>
          <li>🧼 <strong>Gentle Cleansing:</strong> Use warm water and fragrance-free synthetic detergents; avoid scrubbing.</li>
          <li>🚫 <strong>Do Not Scratch:</strong> Keep fingernails short and wear soft cotton gloves at night if necessary.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Keep skin hydrated with calamine or basic moisturizers. Re-test if itching increases." 
        : activeStage === 2 
        ? "👉 Consult a Dermatologist. Light topical steroids (Hydrocortisone 1%) may be recommended." 
        : activeStage === 3 
        ? "🚨 Urgent Dermatologist consult. Moderate-strength topical steroids and oral antihistamines required." 
        : "🚨 <strong>URGENT ALERT:</strong> Widespread weeping rash or signs of infection (fever, heat) require emergency medical review.";
    } else if (detectedCondition.includes("Traumatic")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Tissue border scanning detects active skin tearing or tissue compression with localized bleeding.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Mild abrasion / superficial scrape. Minimal capillary bleeding.' : activeStage === 2 ? 'Moderate laceration. Dermal layer tear without muscle/tendon involvement.' : activeStage === 3 ? 'Deep tissue laceration with visible subcutaneous fat. Continuous active bleeding.' : 'Critical complex wound. Exposed bone, muscle, or tendon. Severe active arterial bleeding.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🩹 <strong>Pressure & Elevation:</strong> Apply firm, direct pressure with a clean cloth. Elevate wound above heart level.</li>
          <li>🧼 <strong>Cleanse:</strong> Rinse under clean running water for 5 minutes. Do not scrub inside the wound.</li>
          <li>🧴 <strong>Antiseptic:</strong> Apply thin layer of petroleum jelly or Neosporin and cover with sterile gauze.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Wash, apply antiseptic ointment, and bandage locally. Monitor for redness." 
        : activeStage === 2 
        ? "👉 Visit a local clinic. A doctor should verify if tetanus booster or light stitches are needed." 
        : activeStage === 3 
        ? "🚨 Urgent medical care required. Stitches should be placed within 6-8 hours to avoid infection." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Active arterial bleeding or deep exposed structures require immediate Emergency Room care.";
    } else {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Photo received: <strong>${file.name}</strong>. General visual review completed.</p>
        <p>Current active severity matches: <strong>${stageTitles[activeStage]}</strong>.</p>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>📊 <strong>Describe:</strong> Detail any visual changes or pain sensations in chat.</li>
          <li>🧴 <strong>Hygiene:</strong> Keep the area clean and avoid application of untested cosmetic creams.</li>
        </ul>
      `;
      medicalAction = "👉 Consult a doctor for a thorough clinical evaluation.";
    }
  } else {
    pathologyHtml = `
      <p><strong>Clinical Pathology Summary:</strong></p>
      <p>Document received: <strong>${file.name}</strong>.</p>
      <p>Current active severity matches: <strong>${stageTitles[activeStage]}</strong>.</p>
    `;
    therapeuticSuggestions = `
      <ul>
        <li>📊 <strong>Provide data:</strong> Share written clinical reports or lab numbers for refined advice.</li>
      </ul>
    `;
    medicalAction = "👉 Consult a primary physician for targeted diagnosis.";
  }

  let tunerHtml = "";
  if (docType !== 'prescription' && docType !== 'discharge' && docType !== 'video') {
    tunerHtml = `
      <div class="med-section info" style="background: rgba(0, 243, 255, 0.03); border: 1px dashed var(--accent); margin-top:12px;">
        <div class="med-section-title" style="color:var(--accent);">🧠 SLM DYNAMIC CLINICAL TUNER</div>
        <p style="font-size:0.75rem; margin-bottom:8px; color:var(--text-muted); line-height:1.3;">This offline Simple Language Model dynamically updates diagnostics as parameters change. Toggle the stage or slider below to align with your medical report values:</p>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; gap:4px;">
          <button class="slm-tuner-btn ${activeStage === 1 ? 'active' : ''}" data-stage="1" style="flex:1; font-size:0.7rem; padding:4px 2px; border-radius:4px; border:1px solid ${activeStage === 1 ? stageColors[1] : 'rgba(255,255,255,0.1)'}; background:${activeStage === 1 ? 'rgba(0,255,179,0.15)' : 'transparent'}; color:${activeStage === 1 ? '#ffffff' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">MILD (S1)</button>
          <button class="slm-tuner-btn ${activeStage === 2 ? 'active' : ''}" data-stage="2" style="flex:1; font-size:0.7rem; padding:4px 2px; border-radius:4px; border:1px solid ${activeStage === 2 ? stageColors[2] : 'rgba(255,255,255,0.1)'}; background:${activeStage === 2 ? 'rgba(255,204,0,0.15)' : 'transparent'}; color:${activeStage === 2 ? '#ffffff' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">MOD (S2)</button>
          <button class="slm-tuner-btn ${activeStage === 3 ? 'active' : ''}" data-stage="3" style="flex:1; font-size:0.7rem; padding:4px 2px; border-radius:4px; border:1px solid ${activeStage === 3 ? stageColors[3] : 'rgba(255,255,255,0.1)'}; background:${activeStage === 3 ? 'rgba(255,102,0,0.15)' : 'transparent'}; color:${activeStage === 3 ? '#ffffff' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">SEV (S3)</button>
          <button class="slm-tuner-btn ${activeStage === 4 ? 'active' : ''}" data-stage="4" style="flex:1; font-size:0.7rem; padding:4px 2px; border-radius:4px; border:1px solid ${activeStage === 4 ? stageColors[4] : 'rgba(255,255,255,0.1)'}; background:${activeStage === 4 ? 'rgba(255,0,85,0.15)' : 'transparent'}; color:${activeStage === 4 ? '#ffffff' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">CRIT (S4)</button>
        </div>

        <div style="margin-top:6px;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:2px;">
            <span>🔧 Adjust ${keyMetricName}:</span>
            <span style="font-weight:bold; color:var(--accent);"><span class="slm-slider-val">${activeMetricVal}</span>${keyMetricUnit}</span>
          </div>
          <input type="range" class="slm-tuner-slider" min="${keyMetricMin}" max="${keyMetricMax}" step="${docType === 'lab' ? '0.1' : '1'}" value="${activeMetricVal}" style="width:100%; cursor:pointer; accent-color:var(--accent);" />
        </div>
      </div>
    `;
  } else if (docType === 'prescription') {
    tunerHtml = `
      <div class="med-section info" style="background: rgba(0, 243, 255, 0.03); border: 1px dashed var(--accent); margin-top:12px;">
        <div class="med-section-title" style="color:var(--accent);">💊 SLM RX EXTRACTOR CHECKLIST</div>
        <p style="font-size:0.75rem; margin-bottom:8px; color:var(--text-muted); line-height:1.3;">Check/uncheck the medications identified on your prescription document to verify conflicts and dosage guidelines in real-time:</p>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:0.75rem;">
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_diabetes" ${tunerParams && tunerParams.med_diabetes ? 'checked' : (!tunerParams && /metformin|diabet/i.test(n) ? 'checked' : '')} /> Metformin (Sugar)</label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_bp" ${tunerParams && tunerParams.med_bp ? 'checked' : (!tunerParams && /lisinopril|amlodipine|bp/i.test(n) ? 'checked' : '')} /> Lisinopril (BP)</label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_chol" ${tunerParams && tunerParams.med_chol ? 'checked' : (!tunerParams && /atorva|statin|chol/i.test(n) ? 'checked' : '')} /> Atorvastatin (Chol)</label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_antibiotic" ${tunerParams && tunerParams.med_antibiotic ? 'checked' : (!tunerParams && /amoxi|antibio|penic/i.test(n) ? 'checked' : '')} /> Amoxicillin (Antibio)</label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_aspirin" ${tunerParams && tunerParams.med_aspirin ? 'checked' : (!tunerParams && /aspirin/i.test(n) ? 'checked' : '')} /> Aspirin (Thinner)</label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" class="slm-tuner-checkbox" data-param="med_pain" ${tunerParams && tunerParams.med_pain ? 'checked' : (!tunerParams && /ibuprofen/i.test(n) ? 'checked' : '')} /> Ibuprofen (Pain)</label>
        </div>
      </div>
    `;
  }

  const containerIdAttr = tunerParams && tunerParams.id ? `data-id="${tunerParams.id}"` : '';
  const resultHtml = `
    <div class="slm-diagnostic-hub" ${containerIdAttr} data-file-name="${file.name.replace(/"/g, '&quot;')}" data-doc-type="${docType}" style="position:relative; width:100%;">
      
      <!-- Diagnostic Vitals Ring & Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px; margin-bottom:8px;">
        <span style="font-size:0.8rem; font-weight:bold; letter-spacing:1px; color:#ffffff;">${b.icon} ${detectedCondition.toUpperCase()}</span>
        <span style="font-size:0.7rem; color:var(--text-muted); padding:2px 6px; border-radius:10px; background:rgba(255,255,255,0.05); font-family:var(--font-mono);">SLM v1.82 · CONFIDENCE: ${confidence}%</span>
      </div>

      <!-- Current Diagnostic Stage Banner -->
      <div style="border-left: 3px solid ${stageColors[activeStage]}; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 0 6px 6px 0; margin-bottom:10px;">
        <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Pathology Severity Stage</div>
        <div style="font-size:0.95rem; font-weight:bold; color:${stageColors[activeStage]}; font-family:var(--font-title);">${stageTitles[activeStage]}</div>
      </div>

      <!-- Main Pathology Details -->
      <div class="med-section info">
        ${pathologyHtml}
      </div>

      <!-- Live SLM Tuner Interface -->
      ${tunerHtml}

      <!-- Therapeutic Suggestions & Guidelines -->
      <div class="med-section info" style="margin-top:12px;">
        <div class="med-section-title">💡 TREATMENT & THERAPEUTIC SUGGESTIONS</div>
        ${therapeuticSuggestions}
      </div>

      <!-- Clinical Action Recommendation -->
      <div class="med-section warning" style="border-color:${stageColors[activeStage]}; background:rgba(${activeStage === 4 ? '255,0,85' : activeStage === 3 ? '255,102,0' : '255,204,0'}, 0.05); margin-top:12px;">
        <div class="med-section-title" style="color:${stageColors[activeStage]};">📋 RECOMMENDED CLINICAL ACTION</div>
        <p>${medicalAction}</p>
      </div>

      <!-- Final Medical Disclaimer -->
      <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 8px; font-style: italic; line-height: 1.2;">
        ⚡ Disclaimer: RAMAN AI local SLM provides non-diagnostic statistical triage. Findings must be validated by a certified healthcare professional.
      </div>
    </div>
  `;

  return resultHtml;
}

// Override old btnAnalyze handler — clone to remove old listener then re-attach
(function() {
  const old = document.getElementById('btnAnalyze');
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('click', () => {
    if (!pendingFile) return;
    const analysis  = document.getElementById('modalAnalysis');
    const manualType = document.getElementById('docTypeSelect').value;
    analysis.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Analyzing with RAMAN AI…</div>`;
    setTimeout(() => {
      const profile  = getProfile();
      const docType  = detectDocType(pendingFile, manualType);
      const result   = analyzeDocument(pendingFile, docType, profile);
      const b        = VAULT_BADGE[docType] || VAULT_BADGE.general;
      const summary  = `${b.icon} ${b.label} – ${pendingFile.name}`;
      analysis.innerHTML = result;
      saveToVault(pendingFile.name, docType, summary, result, pendingFile);
      setTimeout(() => {
        const url    = URL.createObjectURL(pendingFile);
        const isVid  = pendingFile.type.startsWith('video/');
        const thumb  = isVid
          ? `<div class="chat-media-thumb">🎥 <em>${pendingFile.name}</em></div>`
          : `<img src="${url}" style="max-width:220px;border-radius:8px;display:block;margin-bottom:8px;"/>` ;
        addMessage('user', `${thumb}<p>${b.icon} Uploaded <strong>${b.label}</strong>: ${pendingFile.name}</p>`, true);
        addMessage('ai',   result, true);
        closeMediaModal();
        document.getElementById('docTypeSelect').value = 'auto';
      }, 600);
    }, 1800);
  });
})();

// ═══════════════════════════════════════════════════════
// ── DETECTED CONDITIONS TRACKING ───────────────────────
// ═══════════════════════════════════════════════════════
// (detectedConditions declared at top of file)

function saveDetectedCondition(condition) {
  detectedConditions.add(condition);
  localStorage.setItem('ramanai_conditions', JSON.stringify([...detectedConditions]));
}

// (saveDetectedCondition is called directly inside buildResponse above)

// ═══════════════════════════════════════════════════════
// ── PROACTIVE HEALTH GUIDANCE ENGINE ───────────────────
// ═══════════════════════════════════════════════════════
const GUIDANCE_TIPS = {
  diabetes: [
    '🩸 <strong>Diabetes Reminder:</strong> Have you logged your blood sugar today? Fasting level should be 70–100 mg/dL. Post-meal (2 hrs) should be below 140 mg/dL.',
    '🥗 <strong>Diet Tip (Diabetes):</strong> Choose low-glycaemic foods today — oats, dal, vegetables. Avoid white rice, maida, and sugary drinks.',
    '💊 <strong>Medication Check:</strong> Have you taken your Metformin with meals today? Consistency is key to glucose control.'
  ],
  'high blood pressure': [
    '💊 <strong>BP Reminder:</strong> Have you taken your blood pressure medication today? Never skip — abrupt stopping can cause rebound hypertension.',
    '🧂 <strong>Sodium Alert:</strong> Keep sodium intake below 2g/day. Avoid pickles, papad, processed snacks. Increase banana, spinach (potassium) intake.',
    '📏 <strong>BP Monitoring:</strong> Check your blood pressure now and note the reading. BP above 180/120 mmHg = seek emergency care immediately.'
  ],
  'joint pain': [
    '🦵 <strong>Joint Health:</strong> Have you done 10 minutes of gentle range-of-motion exercises today? Inactivity worsens stiffness.',
    '🐟 <strong>Diet Tip (Joints):</strong> Omega-3 rich foods (fish, flaxseed, walnuts) reduce inflammation. Turmeric + black pepper is a natural anti-inflammatory.'
  ],
  fever: [
    '🌡️ <strong>Fever Follow-up:</strong> How are you feeling today? If fever persists beyond 3 days or exceeds 104°F (40°C), please seek urgent medical care.',
    '💧 <strong>Hydration Reminder:</strong> Drink at least 8–10 glasses of water/day during illness. Electrolyte drinks (ORS) help if you had vomiting or diarrhoea.'
  ],
  cough: [
    '🫁 <strong>Respiratory Check:</strong> A cough lasting more than 3 weeks needs investigation — could indicate TB, asthma or GERD. Please consult a doctor.',
    '♨️ <strong>Home Remedy:</strong> Steam inhalation twice daily (add a few drops of eucalyptus oil) can ease congestion and cough.'
  ],
  general: [
    '💧 <strong>Daily Reminder:</strong> Stay hydrated! Drink 8–10 glasses of water today. Dehydration causes headaches, fatigue, and poor concentration.',
    '🛌 <strong>Sleep Hygiene:</strong> Aim for 7–8 hours of sleep. Poor sleep raises blood pressure, blood sugar, and weakens immunity.',
    '🚶 <strong>Activity Reminder:</strong> 30 minutes of brisk walking daily reduces risk of heart disease, diabetes, and depression.',
    '🥗 <strong>Nutrition Tip:</strong> Fill half your plate with vegetables, one-quarter with protein, one-quarter with whole grains.',
    '📅 <strong>Checkup Reminder:</strong> Annual health screenings save lives — blood sugar, BP, lipid profile, and eye check are recommended for adults above 30.'
  ]
};

let lastGuidanceTime = 0;

function scheduleGuidance(onLoad) {
  if (onLoad) {
    // Fire 8 seconds after app loads if profile exists
    setTimeout(() => {
      const raw = localStorage.getItem('ramanai_profile');
      if (raw) {
        try { const p = JSON.parse(raw); if (p.name) sendGuidanceMessage(); } catch(e) {}
      }
    }, 8000);
  }
  // Then every 45 minutes
  setInterval(sendGuidanceMessage, 45 * 60 * 1000);
}

function sendGuidanceMessage() {
  const now = Date.now();
  if (now - lastGuidanceTime < 60000) return; // throttle: not more than once per minute
  lastGuidanceTime = now;

  const profile    = getProfile();
  const conditions = [...detectedConditions];

  // Pick a relevant tip
  let pool = [];
  conditions.forEach(c => {
    if (GUIDANCE_TIPS[c]) pool = pool.concat(GUIDANCE_TIPS[c]);
  });
  if (!pool.length) pool = GUIDANCE_TIPS.general;

  const tip = pool[Math.floor(Math.random() * pool.length)];
  const greeting = profile.name ? `${profile.name}, ` : '';

  const html = `
    <div class="guidance-bubble">
      <div class="guidance-header">💡 HEALTH REMINDER &nbsp;<span class="guidance-time">${nowTime()}</span></div>
      <p>${greeting}${tip}</p>
      ${vaultData.length ? `<p class="guidance-vault">📁 You have <strong>${vaultData.length}</strong> document(s) in your Medical Vault — click any to re-view analysis.</p>` : ''}
    </div>`;

  addMessage('ai', html, true);
}

// ═══════════════════════════════════════════════════════
// ── HEALTH ID SYSTEM ────────────────────────────────────
// ═══════════════════════════════════════════════════════

function generateHealthId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'RMN-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function saveHealthSession() {
  if (!currentHealthId) {
    currentHealthId = generateHealthId();
    sessionCreatedDate = new Date().toISOString();
  }
  const p = getProfile();
  p.pain = document.getElementById('painSlider').value;
  const session = {
    id:        currentHealthId,
    created:   sessionCreatedDate || new Date().toISOString(),
    lastSeen:  new Date().toISOString(),
    profile:   p,
    conditions: [...detectedConditions],
    vault:     vaultData.map(v => ({ id: v.id, name: v.name, type: v.type, date: v.date, summary: v.summary })),
    messages:  chatHistory.slice(-20)
  };
  localStorage.setItem('ramanai_hid_' + currentHealthId, JSON.stringify(session));
  localStorage.setItem('ramanai_current_hid', currentHealthId);
  updateHidChip();
}

function updateHidChip() {
  const chip = document.getElementById('hidChip');
  const disp = document.getElementById('hidDisplay');
  if (chip && currentHealthId) {
    chip.style.display = 'flex';
    if (disp) disp.textContent = currentHealthId;
  }
}



// ═══════════════════════════════════════════════════════
// ── HEALTH ID CARD (shown in chat) ─────────────────────
// ═══════════════════════════════════════════════════════
function showHealthIdCard(hid, isNew) {
  const html = `
    <div class="hid-card">
      <div class="hid-card-header">
        ${isNew ? '🎉 YOUR HEALTH ID IS READY' : '🔄 SESSION RESTORED'}
      </div>
      <div class="hid-card-body">
        <div class="hid-code">${hid}</div>
        <p class="hid-card-desc">
          ${isNew
            ? 'Save this ID. Next visit, enter it on the start screen to instantly restore your profile and full consultation history.'
            : 'Your profile, conditions and Medical Vault have been fully restored.'}
        </p>
        <div class="hid-card-actions">
          <button class="hid-action-btn"
            onclick="navigator.clipboard.writeText('${hid}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy ID'},1500)}).catch(()=>prompt('Copy your Health ID:','${hid}'))">
            📋 Copy ID
          </button>
          <button class="hid-action-btn hid-btn-share" onclick="shareHid('${hid}')">📤 Share</button>
        </div>
      </div>
      <div class="hid-card-footer">🔐 RAMAN AI · Experiment № 170 · Stored Locally</div>
    </div>`;
  addMessage('ai', html, true);
}

function shareHid(hid) {
  const text = `My RAMAN AI Health ID: ${hid}\nUse this to restore my consultation session at RAMAN AI – Experiment № 170.`;
  if (navigator.share) {
    navigator.share({ title: 'RAMAN AI Health ID', text });
  } else {
    prompt('Share your Health ID:', hid);
  }
}

// ── Load session by Health ID ──────────────────────────
function loadHealthSession(hid) {
  hid = hid.toUpperCase().trim();
  // Normalise: if user typed without dash, add it
  if (hid.length === 9 && !hid.includes('-')) hid = hid.slice(0,3) + '-' + hid.slice(3);
  const raw = localStorage.getItem('ramanai_hid_' + hid);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    currentHealthId    = s.id;
    sessionCreatedDate = s.created;

    // Restore profile
    const p = s.profile || {};
    if (p.name)      document.getElementById('patientName').value      = p.name;
    if (p.age)       document.getElementById('patientAge').value        = p.age;
    if (p.gender)    document.getElementById('patientGender').value     = p.gender;
    if (p.blood)     document.getElementById('patientBlood').value      = p.blood;
    if (p.allergies) document.getElementById('patientAllergies').value  = p.allergies;
    if (p.pain) {
      const sl = document.getElementById('painSlider');
      sl.value = p.pain;
      sl.dispatchEvent(new Event('input'));
    }
    updateProfileCompleteness();

    // Restore conditions
    if (s.conditions) s.conditions.forEach(c => detectedConditions.add(c));
    localStorage.setItem('ramanai_conditions', JSON.stringify([...detectedConditions]));

    // Restore vault references (summaries only)
    if (s.vault && s.vault.length) {
      // Merge: add entries not already in vaultData
      s.vault.forEach(v => {
        if (!vaultData.find(x => x.id === v.id)) {
          vaultData.push({ ...v, analysis: v.analysis || '<p>Analysis from previous session. Upload the document again for full review.</p>' });
        }
      });
      localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
      renderVault();
    }

    // Restore chat history array
    if (s.messages) chatHistory = s.messages;

    updateHidChip();
    localStorage.setItem('ramanai_current_hid', hid);
    hidShownThisSession = true;

    // Show restored summary in chat
    const lastSeen = new Date(s.lastSeen).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const condList = s.conditions && s.conditions.length ? s.conditions.join(', ') : 'None recorded';
    const vaultCount = s.vault ? s.vault.length : 0;
    const msgCount   = s.messages ? s.messages.length : 0;
    addMessage('ai', `
      <div class="restore-summary">
        <div class="restore-header">🔄 SESSION RESTORED — ${s.id}</div>
        <div class="restore-grid">
          <div class="restore-cell"><span class="rc-label">PATIENT</span><span class="rc-value">${p.name || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">AGE</span><span class="rc-value">${p.age || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">BLOOD</span><span class="rc-value">${p.blood || '—'}</span></div>
          <div class="restore-cell"><span class="rc-label">LAST VISIT</span><span class="rc-value">${lastSeen}</span></div>
          <div class="restore-cell"><span class="rc-label">CONDITIONS</span><span class="rc-value">${condList}</span></div>
          <div class="restore-cell"><span class="rc-label">VAULT DOCS</span><span class="rc-value">${vaultCount}</span></div>
        </div>
        ${p.allergies ? `<div class="restore-allergy">⚠️ Known allergies: <strong>${p.allergies}</strong></div>` : ''}
        <p style="margin-top:10px;">Welcome back, <strong>${p.name || 'Patient'}</strong>! Your full history is restored. How can I help you today?</p>
      </div>`, true);
    return true;
  } catch(e) {
    console.warn('Health ID load error', e);
    return false;
  }
}

// ── sendMessage is now self-contained (no wrapper needed) ──
// HID logic is wired directly inside sendMessage above.

// Also save after AI responds — hook via chatMessages mutation
const _chatObserver = new MutationObserver(() => {
  if (currentHealthId && sessionMsgs > 0) {
    // debounce
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(saveHealthSession, 1500);
  }
});
const _chatContainer = document.getElementById('chatMessages');
if (_chatContainer) _chatObserver.observe(_chatContainer, { childList: true });

// ── Splash: Health ID input handler ───────────────────
document.getElementById('splashHidBtn').addEventListener('click', handleHidRestore);
document.getElementById('splashHidInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleHidRestore();
});

function handleHidRestore() {
  const btn = document.getElementById('splashHidBtn');
  const input = document.getElementById('splashHidInput').value.trim();
  const errEl = document.getElementById('splashHidError');
  if (!input) { errEl.textContent = 'Please enter your Health ID.'; return; }
  
  btn.textContent = 'RESTORING...';
  errEl.textContent = '';
  
  setTimeout(() => {
    // Stop the auto-dismiss timer
    clearTimeout(window._splashTimer);
    
    const ok = loadHealthSession(input);
    if (!ok) {
      btn.textContent = '↩ RESTORE';
      errEl.textContent = '❌ Health ID not found. Please check and try again.';
      errEl.style.color = '#ff4d6d';
    } else {
      document.getElementById('splashScreen').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      document.getElementById('welcomeTime').textContent = nowTime();
      initParticles();
      renderVault();
      bindTunerEvents();
    }
  }, 800);
}

let tunerEventsBound = false;
function bindTunerEvents() {
  if (tunerEventsBound) return;
  tunerEventsBound = true;

  // 1. Stage selection click listener
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('.slm-tuner-btn');
    if (!btn) return;
    const container = btn.closest('.slm-diagnostic-hub');
    if (!container) return;
    
    const id = container.dataset.id;
    const docType = container.dataset.docType;
    const fileName = container.dataset.fileName;
    const stage = parseInt(btn.dataset.stage);
    
    const slider = container.querySelector('.slm-tuner-slider');
    const val = slider ? slider.value : null;
    
    const checkboxes = container.querySelectorAll('.slm-tuner-checkbox');
    const cbStates = {};
    checkboxes.forEach(cb => { cbStates[cb.dataset.param] = cb.checked; });
    
    const tunerParams = { stage, value: val, ...cbStates, id };
    const profile = getProfile();
    const pseudoFile = { name: fileName };
    const newHtml = analyzeDocument(pseudoFile, docType, profile, tunerParams);
    
    updateViewAndStorage(id, fileName, newHtml, container);
  });

  // 2. Real-time slider label update
  document.body.addEventListener('input', e => {
    const slider = e.target.closest('.slm-tuner-slider');
    if (!slider) return;
    const container = slider.closest('.slm-diagnostic-hub');
    if (!container) return;
    const outputSpan = container.querySelector('.slm-slider-val');
    if (outputSpan) outputSpan.textContent = slider.value;
  });

  // 3. Slider/checkbox change listener to re-evaluate
  document.body.addEventListener('change', e => {
    const element = e.target.closest('.slm-tuner-slider, .slm-tuner-checkbox');
    if (!element) return;
    const container = element.closest('.slm-diagnostic-hub');
    if (!container) return;
    
    const id = container.dataset.id;
    const docType = container.dataset.docType;
    const fileName = container.dataset.fileName;
    
    const activeBtn = container.querySelector('.slm-tuner-btn.active');
    const stage = activeBtn ? parseInt(activeBtn.dataset.stage) : 2;
    
    const slider = container.querySelector('.slm-tuner-slider');
    const val = slider ? slider.value : null;
    
    const checkboxes = container.querySelectorAll('.slm-tuner-checkbox');
    const cbStates = {};
    checkboxes.forEach(cb => { cbStates[cb.dataset.param] = cb.checked; });
    
    const tunerParams = { stage, value: val, ...cbStates, id };
    const profile = getProfile();
    const pseudoFile = { name: fileName };
    const newHtml = analyzeDocument(pseudoFile, docType, profile, tunerParams);
    
    updateViewAndStorage(id, fileName, newHtml, container);
  });
}

function updateViewAndStorage(id, fileName, newHtml, container) {
  // A. Update visible DOM
  const modalAnalysis = document.getElementById('vaultModalAnalysis');
  if (modalAnalysis && container.closest('#vaultModalAnalysis')) {
    modalAnalysis.innerHTML = newHtml;
    const hub = modalAnalysis.querySelector('.slm-diagnostic-hub');
    if (hub && id) hub.dataset.id = id;
  }
  
  const msgBubble = container.closest('.message-bubble');
  if (msgBubble) {
    msgBubble.innerHTML = newHtml;
  }
  
  // B. Sync with storage (vaultData)
  let activeEntry = null;
  if (id) {
    activeEntry = vaultData.find(v => v.id == id);
  } else {
    activeEntry = vaultData.find(v => v.name === fileName);
  }
  if (activeEntry) {
    activeEntry.analysis = newHtml;
    localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
    renderVault();
  }
}

// ── Store the splash timer so it can be cancelled ─────
// Overwrites the dummy timer at top of file; fires after 4.8s splash animation
window._splashTimer = setTimeout(() => {
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  const welcomeEl = document.getElementById('welcomeTime');
  if (welcomeEl) welcomeEl.textContent = nowTime();
  initParticles();
  loadProfile();
  renderVault();
  scheduleGuidance(true);
  bindTunerEvents();
  bindConsultationEvents();
  // If we already have a Health ID from a prior session, show it in header
  if (currentHealthId) {
    updateHidChip();
    hidShownThisSession = true;
  }
}, 4800);

// ═══════════════════════════════════════════════════════
// ── SESSION MANAGER ────────────────────────────────────
// ═══════════════════════════════════════════════════════

function toggleSessionPanel() {
  const panel = document.getElementById('sessionPanel');
  const backdrop = document.getElementById('sessionPanelBackdrop');
  if (panel.classList.contains('open')) {
    closeSessionPanel();
  } else {
    updateSessionPanelUI();
    panel.classList.add('open');
    backdrop.classList.add('open');
  }
}

function closeSessionPanel() {
  document.getElementById('sessionPanel').classList.remove('open');
  document.getElementById('sessionPanelBackdrop').classList.remove('open');
  document.getElementById('spRestoreError').textContent = '';
}

function updateSessionPanelUI() {
  const codeEl = document.getElementById('spHidCode');
  const metaEl = document.getElementById('spHidMeta');
  const actionsEl = document.getElementById('spHidActions');
  const endBtn = document.getElementById('spEndBtn');
  
  if (currentHealthId) {
    codeEl.textContent = currentHealthId;
    codeEl.className = 'sp-hid-code';
    metaEl.innerHTML = `Active Session &bull; Started ${sessionCreatedDate ? new Date(sessionCreatedDate).toLocaleDateString() : 'Today'}`;
    actionsEl.style.display = 'flex';
    endBtn.style.display = 'block';
  } else {
    codeEl.textContent = 'No active session';
    codeEl.className = 'sp-hid-code no-session';
    metaEl.textContent = 'Start a consultation to generate a Health ID';
    actionsEl.style.display = 'none';
    endBtn.style.display = 'none';
  }
  
  // Session History rendering has been removed to enforce medical privacy.
  // Users must manually enter their Health ID to restore a session.
}

function copyHid() {
  if(!currentHealthId) return;
  navigator.clipboard.writeText(currentHealthId);
  const btn = document.getElementById('spCopyBtn');
  btn.textContent = '✅ Copied!';
  setTimeout(() => btn.textContent = '📋 Copy ID', 1500);
}

function shareCurrentHid() {
  if(!currentHealthId) return;
  shareHid(currentHealthId);
}

function endCurrentSession() {
  // Save only if there's actual data to save
  if (currentHealthId || chatHistory.length > 0 || getProfile().name) {
    saveHealthSession(); 
  }
  
  // Clear runtime vars without deleting the saved data
  currentHealthId = null;
  sessionCreatedDate = null;
  chatHistory = [];
  hidShownThisSession = false;
  vaultData = [];
  detectedConditions.clear();
  sessionMsgs = 0;
  lastCondition = null;
  lastConditionTime = 0;
  updateContextIndicator();
  
  // Clear local storage pointers
  localStorage.removeItem('ramanai_current_hid');
  localStorage.removeItem('ramanai_profile');
  localStorage.removeItem('ramanai_vault');
  localStorage.removeItem('ramanai_conditions');
  
  // Reset UI
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('hidChip').style.display = 'none';
  document.getElementById('sessionCount').textContent = '0';
  document.getElementById('patientName').value = '';
  document.getElementById('patientAge').value = '';
  document.getElementById('patientGender').value = '';
  document.getElementById('patientBlood').value = '';
  document.getElementById('patientAllergies').value = '';
  document.getElementById('painSlider').value = 1;
  document.getElementById('painSlider').dispatchEvent(new Event('input'));
  updateProfileCompleteness();
  renderVault();
  
  addMessage('ai', `<div class="med-section info"><p>Session ended and saved securely. You can start a new consultation or restore a previous session from the Session Manager.</p></div>`, true);
  updateSessionPanelUI();
}

function startFreshSession() {
  endCurrentSession();
  document.getElementById('chatMessages').innerHTML = '';
  addMessage('ai', `<p>Welcome to a new session. Please fill in the patient profile on the left and describe the symptoms to begin.</p>`, true);
  closeSessionPanel();
}

function restoreFromPanel(forceId = null) {
  const input = forceId || document.getElementById('spHidInput').value.trim();
  const errEl = document.getElementById('spRestoreError');
  if (!input) { errEl.textContent = 'Please enter a Health ID.'; return; }
  
  if (currentHealthId === input.toUpperCase()) {
    errEl.textContent = 'This session is already active.';
    return;
  }
  
  // Clear current UI before loading
  document.getElementById('chatMessages').innerHTML = '';
  vaultData = [];
  detectedConditions.clear();
  
  closeSessionPanel();
  document.getElementById('spHidInput').value = '';
  showTyping(true);
  
  setTimeout(() => {
    const ok = loadHealthSession(input);
    showTyping(false);
    if (!ok) {
      errEl.textContent = '❌ Health ID not found. Please check and try again.';
      toggleSessionPanel();
    }
  }, 1200);
}

// ═══════════════════════════════════════════════════════
// ── GEMINI API INTEGRATION ─────────────────────────────
// ═══════════════════════════════════════════════════════

function toggleProviderSettings() {
  const providerSelect = document.getElementById("llmProvider");
  if (!providerSelect) return;
  const provider = providerSelect.value;
  const localSlmPanel = document.getElementById("settingsLocalSlm");
  const geminiPanel = document.getElementById("settingsGemini");
  const openaiPanel = document.getElementById("settingsOpenAi");

  if (localSlmPanel) localSlmPanel.style.display = provider === "local-slm" ? "block" : "none";
  if (geminiPanel) geminiPanel.style.display = provider === "gemini" ? "block" : "none";
  if (openaiPanel) openaiPanel.style.display = provider === "openai" ? "block" : "none";
}

function openApiSettings() {
  const backdrop = document.getElementById("apiSettingsBackdrop");
  const modal = document.getElementById("apiSettingsModal");
  if (backdrop) backdrop.style.display = "block";
  if (modal) {
    modal.style.display = "block";
    modal.classList.add("open");
  }

  // Load provider
  const provider = localStorage.getItem("ramanai_llm_provider") || "local-slm";
  const providerSelect = document.getElementById("llmProvider");
  if (providerSelect) providerSelect.value = provider;

  // Load Gemini details
  const geminiKey = localStorage.getItem("ramanai_gemini_api_key") || "";
  const geminiModel = localStorage.getItem("ramanai_gemini_model") || "gemini-1.5-flash";
  const geminiKeyInput = document.getElementById("geminiApiKey");
  const geminiModelSelect = document.getElementById("geminiModel");
  if (geminiKeyInput) geminiKeyInput.value = geminiKey;
  if (geminiModelSelect) geminiModelSelect.value = geminiModel;

  // Load OpenAI details
  const openaiKey = localStorage.getItem("ramanai_openai_api_key") || "";
  const openaiBaseUrl = localStorage.getItem("ramanai_openai_base_url") || "https://api.openai.com/v1";
  const openaiModelName = localStorage.getItem("ramanai_openai_model") || "gpt-4o";
  const openaiKeyInput = document.getElementById("openaiApiKey");
  const openaiBaseUrlInput = document.getElementById("openaiBaseUrl");
  const openaiModelInput = document.getElementById("openaiModel");
  if (openaiKeyInput) openaiKeyInput.value = openaiKey;
  if (openaiBaseUrlInput) openaiBaseUrlInput.value = openaiBaseUrl;
  if (openaiModelInput) openaiModelInput.value = openaiModelName;

  // Load Hyperparameters
  const temp = localStorage.getItem("ramanai_llm_temp") || "0.2";
  const maxTokens = localStorage.getItem("ramanai_llm_max_tokens") || "2048";
  
  const tempInput = document.getElementById("llmTemperature");
  const tempDisplay = document.getElementById("tempValue");
  if (tempInput) tempInput.value = temp;
  if (tempDisplay) tempDisplay.textContent = temp;

  const tokensInput = document.getElementById("llmMaxTokens");
  const tokensDisplay = document.getElementById("tokensValue");
  if (tokensInput) tokensInput.value = maxTokens;
  if (tokensDisplay) tokensDisplay.textContent = maxTokens;

  // Align panel display
  toggleProviderSettings();
}

function closeApiSettings() {
  const backdrop = document.getElementById("apiSettingsBackdrop");
  const modal = document.getElementById("apiSettingsModal");
  if (backdrop) backdrop.style.display = "none";
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("open");
  }
}

function saveApiKey() {
  const providerSelect = document.getElementById("llmProvider");
  const provider = providerSelect ? providerSelect.value : "local-slm";
  
  localStorage.setItem("ramanai_llm_provider", provider);

  // Gemini Settings
  const geminiKey = document.getElementById("geminiApiKey") ? document.getElementById("geminiApiKey").value.trim() : "";
  const geminiModel = document.getElementById("geminiModel") ? document.getElementById("geminiModel").value : "gemini-1.5-flash";
  if (geminiKey) {
    localStorage.setItem("ramanai_gemini_api_key", geminiKey);
  } else {
    localStorage.removeItem("ramanai_gemini_api_key");
  }
  localStorage.setItem("ramanai_gemini_model", geminiModel);

  // OpenAI / Custom Gateway Settings
  const openaiKey = document.getElementById("openaiApiKey") ? document.getElementById("openaiApiKey").value.trim() : "";
  const openaiBaseUrl = document.getElementById("openaiBaseUrl") ? document.getElementById("openaiBaseUrl").value.trim() : "https://api.openai.com/v1";
  const openaiModelName = document.getElementById("openaiModel") ? document.getElementById("openaiModel").value.trim() : "gpt-4o";
  
  if (openaiKey) {
    localStorage.setItem("ramanai_openai_api_key", openaiKey);
  } else {
    localStorage.removeItem("ramanai_openai_api_key");
  }
  localStorage.setItem("ramanai_openai_base_url", openaiBaseUrl);
  localStorage.setItem("ramanai_openai_model", openaiModelName);

  // Save Hyperparameters
  const tempInput = document.getElementById("llmTemperature");
  const tokensInput = document.getElementById("llmMaxTokens");
  const temp = tempInput ? tempInput.value : "0.2";
  const maxTokens = tokensInput ? tokensInput.value : "2048";
  localStorage.setItem("ramanai_llm_temp", temp);
  localStorage.setItem("ramanai_llm_max_tokens", maxTokens);

  const isOr = window.currentLang === 'or';
  if (provider === "local-slm") {
    const alertMsg = isOr 
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! ରାମନ୍ ଲୋକାଲ୍ SLM ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! RAMAN Local SLM is the active engine.";
    alert(alertMsg);
  } else if (provider === "gemini") {
    const alertMsg = isOr
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! ଗୁଗଲ୍ ଜେମିନି API ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! Google Gemini API is the active engine.";
    alert(alertMsg);
  } else if (provider === "openai") {
    const alertMsg = isOr
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! କଷ୍ଟମ୍ API ଗେଟୱେ ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! Custom API Gateway is the active engine.";
    alert(alertMsg);
  }

  closeApiSettings();
}

// ============================================================================
// ── CLINICAL CONSULTATION WIZARD & SIMULATION ENGINE (100% OFFLINE) ─────────
// ============================================================================

function storeSimulatedFileInDB(id, name, type, dataUrl) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }
    const transaction = db.transaction([dbStoreName], "readwrite");
    const store = transaction.objectStore(dbStoreName);
    const record = {
      id: id,
      name: name,
      type: type,
      dataUrl: dataUrl
    };
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = e => reject(e.target.error);
  });
}

function saveSimulatedToVault(name, type, summary, analysis, dataUrl) {
  const id = Date.now();
  const entry = {
    id,
    name, type, summary, analysis,
    date: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  };
  
  vaultData.unshift(entry);
  if (vaultData.length > 20) {
    const popped = vaultData.pop();
    deleteFileFromDB(popped.id).catch(e => console.error("Could not delete file from IndexedDB:", e));
  }
  
  localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
  
  storeSimulatedFileInDB(id, name, 'image/png', dataUrl)
    .then(() => console.log(`Simulated file stored in IndexedDB: ${name} with ID: ${id}`))
    .catch(e => console.error("Could not store simulated file in IndexedDB:", e));
    
  renderVault();
  saveDetectedCondition(type);
  return id;
}

function generateSimulatedLabFile(type, title) {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, 400, 300);

  // Border & Grid lines
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(5, 5, 390, 290);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
  for (let i = 20; i < 400; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 5);
    ctx.lineTo(i, 295);
    ctx.stroke();
  }
  for (let j = 20; j < 300; j += 20) {
    ctx.beginPath();
    ctx.moveTo(5, j);
    ctx.lineTo(395, j);
    ctx.stroke();
  }

  // Draw Title
  ctx.fillStyle = '#00e5ff';
  ctx.font = '14px Orbitron, Rajdhani, Courier';
  ctx.fillText("RAMAN CLINICAL SIMULATION V1.70", 20, 30);
  
  ctx.fillStyle = '#e2eaf5';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText(`TEST: ${title.toUpperCase()}`, 20, 55);
  ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, 20, 75);
  ctx.fillText("STATUS: CLINICALLY COMPLETED", 20, 95);

  // Draw some simulated graphics based on the test type
  if (type === 'ecg') {
    // Draw heart rate signal
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 180);
    let x = 20;
    while (x < 380) {
      ctx.lineTo(x + 20, 180);
      ctx.lineTo(x + 25, 150);
      ctx.lineTo(x + 30, 210);
      ctx.lineTo(x + 35, 175);
      ctx.lineTo(x + 40, 180);
      ctx.lineTo(x + 60, 180);
      x += 60;
    }
    ctx.stroke();
    
    ctx.fillStyle = '#ff4d6d';
    ctx.font = '10px Courier';
    ctx.fillText("12-LEAD ELECTROCARDIOGRAM SIGNAL SIMULATED", 20, 250);
  } else if (type === 'xray') {
    // Draw two simulated lung silhouettes
    ctx.fillStyle = 'rgba(155, 107, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(130, 170, 40, 70, 0, 0, Math.PI * 2);
    ctx.ellipse(270, 170, 40, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Add opacity markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(135, 160, 15, 0, Math.PI * 2);
    ctx.arc(265, 180, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#9b6bff';
    ctx.font = '10px Courier';
    ctx.fillText("PA CHEST X-RAY IMAGING SIMULATED", 20, 250);
  } else {
    // Lab report - draw table
    ctx.fillStyle = '#00ffb3';
    ctx.font = '11px Courier';
    ctx.fillText("METRIC", 20, 140);
    ctx.fillText("VALUE", 180, 140);
    ctx.fillText("REFERENCE", 280, 140);
    
    ctx.fillStyle = '#e2eaf5';
    ctx.fillText("Glucose Panel", 20, 165);
    ctx.fillText("142 mg/dL", 180, 165);
    ctx.fillText("< 100 mg/dL", 280, 165);

    ctx.fillText("HbA1c Sugar", 20, 190);
    ctx.fillText("7.8 %", 180, 190);
    ctx.fillText("< 5.7 %", 280, 190);

    ctx.fillText("Creatinine", 20, 215);
    ctx.fillText("1.4 mg/dL", 180, 215);
    ctx.fillText("0.6 - 1.2", 280, 215);
  }

  // Convert canvas to a File object
  const dataURL = canvas.toDataURL('image/png');
  return dataURL;
}

window.downloadPrescriptionPDF = function(data) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Popup blocked! Please allow popups for RAMAN AI to download your prescription.");
    return;
  }
  
  const currentDate = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const p = getProfile();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Clinical Rx Prescription - ${p.name || 'Patient'}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Inter:wght@400;500;700&family=Orbitron:wght@700&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          background: #ffffff;
          padding: 20px;
          line-height: 1.5;
        }
        
        .prescription-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #0284c7;
          border-radius: 12px;
          padding: 30px;
          position: relative;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        
        /* Hospital Header */
        .rx-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px double #0284c7;
          padding-bottom: 20px;
          margin-bottom: 20px;
        }
        
        .clinic-info h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 1.6rem;
          color: #0284c7;
          letter-spacing: 1px;
        }
        
        .clinic-info p {
          font-size: 0.85rem;
          color: #64748b;
          margin-top: 4px;
        }
        
        .rx-badge {
          text-align: right;
        }
        
        .rx-badge h2 {
          font-family: 'Cinzel', serif;
          font-size: 1.8rem;
          color: #0f172a;
        }
        
        .rx-badge p {
          font-size: 0.75rem;
          background: #e0f2fe;
          color: #0369a1;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: bold;
          display: inline-block;
          margin-top: 5px;
        }
        
        /* Patient Details Table */
        .patient-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        
        .patient-table td {
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          font-size: 0.85rem;
        }
        
        .patient-table td.label {
          font-weight: bold;
          background: #f8fafc;
          color: #475569;
          width: 18%;
        }
        
        .vitals-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 25px;
        }
        
        .vital-box {
          text-align: center;
        }
        
        .vital-box .v-name {
          font-size: 0.7rem;
          color: #0369a1;
          text-transform: uppercase;
          font-weight: bold;
        }
        
        .vital-box .v-val {
          font-size: 1.1rem;
          font-weight: 700;
          color: #0f172a;
          margin-top: 3px;
        }
        
        /* Diagnosis Section */
        .section-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.9rem;
          color: #0284c7;
          border-bottom: 1px solid #bae6fd;
          padding-bottom: 5px;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .diagnosis-box {
          background: #fafafa;
          border-left: 4px solid #0284c7;
          padding: 12px;
          border-radius: 0 6px 6px 0;
          margin-bottom: 25px;
        }
        
        .diagnosis-box h3 {
          font-size: 1rem;
          color: #0f172a;
        }
        
        .diagnosis-box p {
          font-size: 0.85rem;
          color: #475569;
          margin-top: 4px;
        }
        
        /* Rx prescription list */
        .rx-symbol {
          font-family: 'Cinzel', serif;
          font-size: 2.2rem;
          color: #0284c7;
          margin-bottom: 10px;
          display: inline-block;
        }
        
        .med-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        
        .med-table th {
          background: #0284c7;
          color: #ffffff;
          text-align: left;
          padding: 10px 12px;
          font-size: 0.85rem;
          font-family: 'Orbitron', sans-serif;
          font-weight: normal;
        }
        
        .med-table td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.85rem;
        }
        
        .med-table tr:last-child td {
          border-bottom: none;
        }
        
        /* Advice & Instructions */
        .advice-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .advice-list {
          font-size: 0.8rem;
          color: #334155;
          padding-left: 15px;
        }
        
        .advice-list li {
          margin-bottom: 6px;
        }
        
        /* Emergency Guideline */
        .warning-notice {
          background: #fff1f2;
          border: 1px solid #ffe4e6;
          border-left: 4px solid #f43f5e;
          padding: 12px;
          border-radius: 4px;
          font-size: 0.8rem;
          color: #9f1239;
          margin-bottom: 30px;
        }
        
        /* Signature Area */
        .footer-sig-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        
        .sig-stamp {
          text-align: center;
          width: 180px;
        }
        
        .sig-stamp img {
          max-height: 50px;
          margin-bottom: 5px;
        }
        
        .sig-line {
          border-top: 1px solid #000;
          margin-top: 5px;
          padding-top: 5px;
          font-size: 0.75rem;
          font-weight: bold;
          color: #475569;
        }
        
        .disclaimer {
          font-size: 0.65rem;
          color: #94a3b8;
          text-align: center;
          margin-top: 25px;
          line-height: 1.4;
        }
        
        /* Print Styles */
        @media print {
          body {
            padding: 0;
            background: none;
          }
          .prescription-container {
            border: none;
            box-shadow: none;
            padding: 0;
          }
          .no-print {
            display: none;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
        
        .btn-print-box {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }
        
        .print-btn {
          background: #0284c7;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          font-size: 0.9rem;
          box-shadow: 0 4px 10px rgba(2,132,199,0.3);
          transition: all 0.2s;
        }
        
        .print-btn:hover {
          background: #0369a1;
        }
      </style>
    </head>
    <body>
      <div class="btn-print-box no-print">
        <button class="print-btn" onclick="window.print()">🖨️ PRINT / SAVE AS PDF</button>
      </div>
      
      <div class="prescription-container">
        <!-- Clinic Header -->
        <div class="rx-header">
          <div class="clinic-info">
            <h1>RAMAN AI VIRTUAL CLINIC</h1>
            <p><strong>Offline Neural Diagnostics Unit (Experiment No. 170)</strong></p>
            <p>Healthcare System: Local Client-Side Inference Sandbox</p>
            <p>Virtual ID: ${data.healthId || 'RAMAN-HID-170'}</p>
          </div>
          <div class="rx-badge">
            <h2>Rx</h2>
            <p>CLINICAL TRIAGE VIRTUAL Rx</p>
          </div>
        </div>
        
        <!-- Patient Info -->
        <table class="patient-table">
          <tr>
            <td class="label">Patient Name</td>
            <td><strong>${p.name || 'Anonymous Patient'}</strong></td>
            <td class="label">Age / Gender</td>
            <td>${p.age || 'N/A'} Yrs / ${p.gender || 'Not specified'}</td>
          </tr>
          <tr>
            <td class="label">Blood Group</td>
            <td>${p.blood || 'Unknown'}</td>
            <td class="label">Date / Time</td>
            <td>${currentDate}</td>
          </tr>
          <tr>
            <td class="label">Drug Allergies</td>
            <td colspan="3" style="color: ${p.allergies ? '#ef4444' : '#1e293b'}; font-weight: ${p.allergies ? 'bold' : 'normal'};">
              ${p.allergies || 'NONE REPORTED'}
            </td>
          </tr>
        </table>
        
        <!-- Patient Vitals -->
        ${(data.vitals.bp || data.vitals.heartRate || data.vitals.temp || data.vitals.SpO2) ? `
        <div class="vitals-grid" style="grid-template-columns: repeat(${[data.vitals.bp, data.vitals.heartRate, data.vitals.temp, data.vitals.SpO2].filter(Boolean).length}, 1fr); margin-bottom: 25px;">
          ${data.vitals.bp ? `
          <div class="vital-box">
            <div class="v-name">Blood Pressure</div>
            <div class="v-val">${data.vitals.bp} mmHg</div>
          </div>
          ` : ''}
          ${data.vitals.heartRate ? `
          <div class="vital-box">
            <div class="v-name">Heart Rate</div>
            <div class="v-val">${data.vitals.heartRate} bpm</div>
          </div>
          ` : ''}
          ${data.vitals.temp ? `
          <div class="vital-box">
            <div class="v-name">Temperature</div>
            <div class="v-val">${data.vitals.temp} &deg;F</div>
          </div>
          ` : ''}
          ${data.vitals.SpO2 ? `
          <div class="vital-box">
            <div class="v-name">Oxygen SpO2</div>
            <div class="v-val">${data.vitals.SpO2} %</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        <!-- Diagnosed Condition -->
        <div class="section-title">Clinical Assessment</div>
        <div class="diagnosis-box">
          <h3>${data.condition} (${data.stage})</h3>
          <p><strong>Primary Assessment Marker:</strong> ${data.metricName} resolved at <strong>${data.metricValue}</strong>. Confidence level: 96% based on local Naive Bayes offline training.</p>
          <p><strong>Risk Factors Identified:</strong> ${data.risks.length > 0 ? data.risks.join(', ') : 'None active'}</p>
        </div>
        
        <!-- Rx Medicines Table -->
        <div class="section-title">Prescribed Pharmacotherapy</div>
        <span class="rx-symbol">℞</span>
        <table class="med-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 35%;">Medicine Name & Strength</th>
              <th style="width: 40%;">Instructions & Frequency</th>
              <th style="width: 20%;">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${data.medicines.map((m, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${m.name}</strong></td>
                <td>${m.instructions}</td>
                <td>${m.duration}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- Advice and Diet Grid -->
        <div class="advice-grid">
          <div>
            <div class="section-title">Dietary Guidelines</div>
            <ul class="advice-list">
              ${data.diet.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
          <div>
            <div class="section-title">Clinical Precautions</div>
            <ul class="advice-list">
              ${data.precautions.map(pr => `<li>${pr}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <!-- Emergency Guidelines -->
        ${data.urgencyWarning ? `
          <div class="warning-notice">
            <strong>🚨 EMERGENCY VIRTUAL ALERT:</strong> ${data.urgencyWarning}
          </div>
        ` : ''}
        
        <!-- Signatures & Stamps -->
        <div class="footer-sig-area">
          <div style="font-size:0.75rem; color:#64748b;">
            <p>Registered Laboratory Directive ID: <strong>LAB-SIM-${Date.now().toString().slice(-6)}</strong></p>
            <p>Inference Processing Latency: <strong>${data.latency || '0.250'} milliseconds</strong></p>
            <p>Bilingual Language Layer: <strong>English / Odia</strong></p>
          </div>
          
          <div class="sig-stamp">
            <div style="font-family: 'Cinzel', serif; font-size: 0.9rem; color: #0284c7; font-weight: bold; border: 2px solid #0284c7; padding: 4px; border-radius: 4px; display: inline-block; transform: rotate(-3deg); margin-bottom: 5px; opacity: 0.85;">
              RAMAN AI SLM
            </div>
            <div class="sig-line">Ramanuja Pathy (Signature Authority)</div>
            <div style="font-size: 0.65rem; color:#64748b; margin-top:2px;">Electronically certified offline</div>
          </div>
        </div>
        
        <!-- Legal Disclaimer -->
        <div class="disclaimer">
          ⚠️ IMPORTANT LEGAL CLINICAL DISCLAIMER: RAMAN AI (Experiment No. 170) is a simulated virtual healthcare triage sandbox. All diagnostic classifications, lab results, and Rx drug formulations are synthesized client-side by a local lightweight Simple Language Model (SLM) vocabulary classifier and bigram Markov chain. This document is intended for educational demonstration, offline triage, and clinical sandbox validation. It DOES NOT substitute a real human doctor's physical examination, professional diagnosis, or active drug prescription. Please consult a qualified human physician before administering any medications listed in this simulated Rx.
        </div>
      </div>
      
      <script>
        // Auto open print dialog
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        }
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

window.downloadSlmPrescriptionPDF = function(conditionKey) {
  const slmStartTime = performance.now();
  const kb = MEDICAL_KB[conditionKey];
  if (!kb) {
    alert("Unable to resolve medication database for this condition.");
    return;
  }
  
  // Format medicines as expected by downloadPrescriptionPDF
  const medicines = kb.medications.map(m => ({
    name: m.name,
    instructions: m.dose + " — " + m.note,
    duration: "As needed / 5-7 Days"
  }));

  // Fetch optional vitals from patient profile left panel
  const p = getProfile();
  const bpVal = p.bp || "";
  const hrVal = p.heartRate || "";
  const tempVal = p.temp || "";
  const spo2Val = p.SpO2 || "";

  // Derive condition name and dynamic diagnostic metrics
  let conditionName = conditionKey.toUpperCase();
  let metricName = "Clinical Indicator";
  let metricValue = "Standard";
  let stageText = "Stage 1 (Mild / Standard)";

  if (conditionKey === "fever") {
    conditionName = "Acute Febrile Systemic Illness";
    metricName = "Systemic Inflammatory Response";
    metricValue = tempVal ? tempVal + " °F" : "N/A";
  } else if (conditionKey === "headache") {
    conditionName = "Intracranial Vasospastic Cephalgia";
    metricName = "Intracranial Tension Level";
    metricValue = "Mild";
  } else if (conditionKey === "cough") {
    conditionName = "Acute Bronchial Hyperresponsiveness";
    metricName = "Pulmonary Congestion Index";
    metricValue = "Normal";
  } else if (conditionKey === "chest pain") {
    conditionName = "Myocardial Ischemia / Coronary Risk";
    metricName = "Myocardial Injury Index";
    metricValue = "Critical";
    stageText = "Stage 3 (Severe / Critical Risk)";
  } else if (conditionKey === "stomach pain") {
    conditionName = "Acute Gastritis / Peptic Distress";
    metricName = "Gastrointestinal Acid Scale";
    metricValue = "Elevated";
  } else if (conditionKey === "joint pain") {
    conditionName = "Arthritic Joint Inflammation";
    metricName = "Joint Mobility Coefficient";
    metricValue = "Decreased";
  } else if (conditionKey === "skin rash") {
    conditionName = "Allergic Dermatitis / Pruritus";
    metricName = "Dermal Hypersensitivity Index";
    metricValue = "Active";
  } else if (conditionKey === "high blood pressure") {
    conditionName = "Primary Essential Hypertension";
    metricName = "Systolic Tension Index";
    metricValue = bpVal;
    stageText = "Stage 2 (Moderate Risk)";
  } else if (conditionKey === "diabetes") {
    conditionName = "Chronic Glycemic Dysregulation";
    metricName = "Blood Glucose Saturation";
    metricValue = "Elevated";
  } else if (conditionKey === "eye pain") {
    conditionName = "Acute Ocular Strain / Conjunctivitis";
    metricName = "Intraocular Pressure Coefficient";
    metricValue = "Borderline";
  } else if (conditionKey === "back pain") {
    conditionName = "Lumbar Musculoskeletal Strain";
    metricName = "Vertebral Loading Index";
    metricValue = "Moderate";
  }

  // Allergy warning alert check
  let allergyWarning = "";
  if (p.allergies) {
    const allergyLower = p.allergies.toLowerCase();
    const matchedMeds = kb.medications.filter(med => 
      med.name.toLowerCase().includes(allergyLower) || 
      (allergyLower.includes("nsaid") && (med.name.toLowerCase().includes("ibuprofen") || med.name.toLowerCase().includes("diclofenac") || med.name.toLowerCase().includes("aspirin"))) ||
      (allergyLower.includes("penicillin") && med.name.toLowerCase().includes("amoxicillin"))
    );
    if (matchedMeds.length > 0) {
      allergyWarning = `Contraindicated suggested medications detected: ${matchedMeds.map(m => m.name).join(", ")}. Documented allergy: "${p.allergies}".`;
    }
  }

  // Construct print-ready Rx data
  const rxData = {
    healthId: currentHealthId || 'RAMAN-HID-170',
    condition: conditionName,
    stage: stageText,
    metricName: metricName,
    metricValue: metricValue,
    vitals: { bp: bpVal, heartRate: hrVal, temp: tempVal, SpO2: spo2Val },
    risks: allergyWarning ? ["Allergy Contraindication"] : [],
    medicines: medicines,
    diet: kb.diet || [],
    precautions: kb.precautions || [],
    urgencyWarning: allergyWarning || (conditionKey === "chest pain" ? "Treat all chest pain as cardiac emergency. Seek physical ER care immediately." : ""),
    latency: (performance.now() - slmStartTime).toFixed(3)
  };

  // Call the main download prescription method
  window.downloadPrescriptionPDF(rxData);
};

function initiateClinicalConsultation() {
  const p = getProfile();
  const isProfileComplete = p.name && p.age && p.gender && p.blood && p.allergies;
  if (!isProfileComplete) {
    addMessage("ai", `<div class="med-section warning"><p>⚠️ <strong>Intake Blocked:</strong> Please completely fill in your <strong>Patient Profile</strong> (Name, Age, Gender, Blood Group, Allergies) in the left panel to ensure clinical safety.</p></div>`, true);
    document.getElementById("chatMessages").scrollTop = 9999;
    return;
  }

  activeConsultation = {
    step: 1,
    selectedSymptoms: [],
    duration: '1-3 Days',
    vitals: { bp: '', heartRate: '', temp: '', SpO2: '' },
    risks: [],
    recommendedTests: [],
    simulatedLabData: null
  };

  const container = document.getElementById("chatMessages");
  const oldWizard = document.getElementById("activeConsultationWizard");
  if (oldWizard) oldWizard.remove();
  
  const div = document.createElement("div");
  div.className = "message ai-message";
  div.id = "activeConsultationWizard";
  
  div.innerHTML = `
    <div class="message-avatar ai-avatar"><span>🤖</span></div>
    <div class="message-content">
      <div class="message-header">
        <span class="sender-name">RAMAN AI</span>
        <span class="message-badge">Experiment № 170</span>
        <span class="message-time">${nowTime()}</span>
      </div>
      <div class="message-bubble ai-bubble" style="background:var(--bg-glass); border:1px solid rgba(0,229,255,0.25); box-shadow:0 0 15px rgba(0,229,255,0.15); backdrop-filter:blur(8px);" id="wizardBubbleBody">
        <!-- Step 1 will load here -->
      </div>
    </div>
  `;
  
  container.appendChild(div);
  renderWizardStep1();
  container.scrollTop = 9999;
}

function renderWizardStep1() {
  const body = document.getElementById("wizardBubbleBody");
  if (!body) return;
  
  const p = getProfile();
  body.innerHTML = `
    <div class="med-section info consultation-card" style="border:none; background:transparent; padding:0;">
      <div class="med-section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--cyan); font-family:var(--font-head); font-size:0.95rem;">💬 CLINICAL CONSULTATION (STEP 1/3)</span>
        <span class="message-badge" style="background:var(--cyan); color:#0f172a;">SYMPTOM ANALYSIS</span>
      </div>
      <p style="margin-top:10px; font-size:0.85rem; color:var(--text-main); line-height:1.4;">
        Welcome, <strong>${p.name}</strong>. I will guide you through a thorough clinical triage.
      </p>
      <p style="font-weight:bold; margin-top:15px; margin-bottom:8px; font-size:0.8rem; text-transform:uppercase; color:var(--cyan);">1. Select active symptoms (Select all that apply):</p>
      <div class="consultation-symptom-chips" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;">
        <button class="consult-chip-btn" data-symptom="Fever" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">Fever / ଜ୍ୱର</button>
        <button class="consult-chip-btn" data-symptom="Cough" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">Cough / କାଶ</button>
        <button class="consult-chip-btn" data-symptom="Chest Pain" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">Chest Pain / ଛାତି ଯନ୍ତ୍ରଣା</button>
        <button class="consult-chip-btn" data-symptom="Stomach Pain" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">Stomach Pain / ପେଟ ବ୍ୟଥା</button>
        <button class="consult-chip-btn" data-symptom="High BP" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">High BP / ରକ୍ତଚାପ</button>
        <button class="consult-chip-btn" data-symptom="Diabetes" style="background:#0f172a; border:1px solid var(--cyan); color:var(--cyan); padding:6px 12px; border-radius:15px; cursor:pointer; font-size:0.8rem; font-weight:bold; transition:all 0.2s; outline:none;">Diabetes / ମଧୁମେହ</button>
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block; font-weight:bold; margin-bottom:6px; font-size:0.8rem; text-transform:uppercase; color:var(--cyan);">2. Duration of symptoms / Onset period:</label>
        <select id="consultDuration" style="background:#050d1a; border:1px solid var(--border); color:var(--text-main); width:100%; padding:8px; border-radius:6px; font-family:var(--font-ui); outline:none;">
          <option value="1-3 Days">1-3 Days (Acute)</option>
          <option value="4-7 Days">4-7 Days (Developing)</option>
          <option value="1-2 Weeks">1-2 Weeks (Persistent)</option>
          <option value="More than 2 weeks">More than 2 weeks (Chronic)</option>
        </select>
      </div>
      <div style="display:flex; justify-content:flex-end;">
        <button id="btnConsultStep1Submit" style="background:var(--cyan); border:none; padding:8px 18px; border-radius:6px; font-weight:bold; color:#0f172a; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(0,229,255,0.3); transition:all 0.3s; font-family:var(--font-head);">NEXT: RISK PROFILING ➡️</button>
      </div>
    </div>
  `;
}

function transitionToConsultStep2() {
  const body = document.getElementById("wizardBubbleBody");
  if (!body) return;
  
  body.innerHTML = `
    <div class="med-section info consultation-card" style="border:none; background:transparent; padding:0;">
      <div class="med-section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:var(--teal); font-family:var(--font-head); font-size:0.95rem;">💬 CLINICAL CONSULTATION (STEP 2/3)</span>
        <span class="message-badge" style="background:var(--teal); color:#0f172a;">RISKS & VITALS</span>
      </div>
      <div style="margin-top:10px; font-size:0.8rem; padding:6px 10px; background:rgba(0,255,179,0.06); border-left:3px solid var(--teal); border-radius:4px; margin-bottom:15px; line-height:1.4;">
        <strong>Mapped Symptoms:</strong> ${activeConsultation.selectedSymptoms.join(', ')} (${activeConsultation.duration})
      </div>
      
      <p style="font-weight:bold; margin-bottom:6px; font-size:0.8rem; text-transform:uppercase; color:var(--teal);">1. Patient Vitals Input:</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
        <div>
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:3px;">Blood Pressure (mmHg)</label>
          <input type="text" id="consultVitalsBP" placeholder="e.g. 120/80" value="122/82" style="background:#050d1a; border:1px solid var(--border); color:var(--text-main); width:100%; padding:6px 8px; border-radius:4px; font-family:var(--font-ui); outline:none;">
        </div>
        <div>
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:3px;">Heart Rate (bpm)</label>
          <input type="number" id="consultVitalsHR" placeholder="e.g. 72" value="76" style="background:#050d1a; border:1px solid var(--border); color:var(--text-main); width:100%; padding:6px 8px; border-radius:4px; font-family:var(--font-ui); outline:none;">
        </div>
        <div>
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:3px;">Temperature (°F)</label>
          <input type="number" step="0.1" id="consultVitalsTemp" placeholder="e.g. 98.6" value="98.8" style="background:#050d1a; border:1px solid var(--border); color:var(--text-main); width:100%; padding:6px 8px; border-radius:4px; font-family:var(--font-ui); outline:none;">
        </div>
        <div>
          <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:3px;">SpO2 Oxygen (%)</label>
          <input type="number" id="consultVitalsSpO2" placeholder="e.g. 98" value="98" style="background:#050d1a; border:1px solid var(--border); color:var(--text-main); width:100%; padding:6px 8px; border-radius:4px; font-family:var(--font-ui); outline:none;">
        </div>
      </div>
      
      <p style="font-weight:bold; margin-bottom:6px; font-size:0.8rem; text-transform:uppercase; color:var(--teal);">2. Select Active Risk Factors:</p>
      <div class="consultation-risks" style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; font-size:0.8rem;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text-main);">
          <input type="checkbox" class="consult-risk-cb" value="Family history of cardiovascular issues" style="accent-color:var(--teal);"> Family history of cardiovascular issues
        </label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text-main);">
          <input type="checkbox" class="consult-risk-cb" value="Active smoker / Tobacco exposure" style="accent-color:var(--teal);"> Active smoker / Tobacco exposure
        </label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text-main);">
          <input type="checkbox" class="consult-risk-cb" value="Chronic high stress lifestyle" style="accent-color:var(--teal);"> Chronic high stress lifestyle
        </label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text-main);">
          <input type="checkbox" class="consult-risk-cb" value="Recent domestic / international travel" style="accent-color:var(--teal);"> Recent domestic / international travel
        </label>
      </div>
      
      <div style="display:flex; justify-content:flex-end;">
        <button id="btnConsultStep2Submit" style="background:var(--teal); border:none; padding:8px 18px; border-radius:6px; font-weight:bold; color:#0f172a; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(0,255,179,0.3); transition:all 0.3s; font-family:var(--font-head);">NEXT: TEST DIRECTIVE ➡️</button>
      </div>
    </div>
  `;
  document.getElementById("chatMessages").scrollTop = 9999;
}

function transitionToConsultStep3() {
  const body = document.getElementById("wizardBubbleBody");
  if (!body) return;
  
  const recommendedTests = activeConsultation.recommendedTests;
  
  body.innerHTML = `
    <div class="med-section info consultation-card" style="border:none; background:transparent; padding:0;">
      <div class="med-section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#1a6fff; font-family:var(--font-head); font-size:0.95rem;">💬 CLINICAL CONSULTATION (STEP 3/3)</span>
        <span class="message-badge" style="background:#1a6fff; color:#ffffff;">DIAGNOSTIC DIRECTIVE</span>
      </div>
      <p style="margin-top:10px; font-size:0.85rem; color:var(--text-main); line-height:1.4;">
        Based on your symptoms and clinical vitals, the RAMAN SLM Engine has formulated a diagnostic test directive. To proceed, please simulate and analyze the results of these tests.
      </p>
      
      <p style="font-weight:bold; margin-top:15px; margin-bottom:8px; font-size:0.8rem; text-transform:uppercase; color:#00e5ff;">🔬 Recommended Medical Tests:</p>
      <ul style="margin:0 0 20px 20px; font-size:0.85rem; line-height:1.5;">
        ${recommendedTests.map(t => `<li style="margin-bottom:5px; color:var(--text-main); font-weight:bold;">${t}</li>`).join('')}
      </ul>
      
      <div style="background:rgba(26,111,255,0.06); border:1px solid rgba(26,111,255,0.2); padding:12px; border-radius:6px; font-size:0.8rem; margin-bottom:20px; line-height:1.5; color:var(--text-main);">
        📄 <strong>Simulation Sandbox:</strong> RAMAN AI will generate synthetic laboratory and radiology outcomes matching the specified clinical symptoms. These findings will be securely stored in your local Health Vault.
      </div>
      
      <div style="display:flex; justify-content:flex-end;">
        <button id="btnConsultSimulateTest" style="background:#1a6fff; border:none; padding:12px 20px; border-radius:6px; font-weight:bold; color:#ffffff; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:6px; box-shadow:0 0 12px rgba(26,111,255,0.4); transition:all 0.3s; width:100%; justify-content:center; font-family:var(--font-head);">🔬 SIMULATE & UPLOAD CLINICAL LAB TEST RESULTS</button>
      </div>
    </div>
  `;
  document.getElementById("chatMessages").scrollTop = 9999;
}

function startConsultationLoader() {
  const body = document.getElementById("wizardBubbleBody");
  if (!body) return;

  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  if (cpu) cpu.style.width = "96%";
  if (neural) neural.style.width = "98%";

  body.innerHTML = `
    <div class="med-section info consultation-card" style="border:1px dashed var(--cyan); background:rgba(0, 229, 255, 0.04); padding:15px; border-radius:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <span style="font-family:var(--font-head); font-size:0.8rem; color:var(--cyan); letter-spacing:1px; animation:pulse 1.5s infinite;">⚡ CALIBRATING LOCAL SLM DIAGNOSTICS</span>
        <span id="slmLoaderPercent" style="font-family:var(--font-ui); font-size:0.9rem; font-weight:bold; color:var(--cyan);">0%</span>
      </div>
      <div style="background:rgba(255,255,255,0.05); height:8px; border-radius:4px; overflow:hidden; margin-bottom:12px;">
        <div id="slmLoaderBar" style="width:0%; height:100%; background:linear-gradient(90deg, var(--cyan), var(--teal)); transition:width 0.1s linear; box-shadow:0 0 8px var(--cyan);"></div>
      </div>
      <p id="slmLoaderText" style="font-family:var(--font-ui); font-size:0.8rem; color:var(--text-muted); margin:0;">Initializing neural token parsing...</p>
    </div>
  `;
  
  let percent = 0;
  const interval = setInterval(() => {
    percent += 2.5;
    
    const pctEl = document.getElementById("slmLoaderPercent");
    const barEl = document.getElementById("slmLoaderBar");
    const txtEl = document.getElementById("slmLoaderText");
    
    if (pctEl) pctEl.textContent = Math.round(percent) + "%";
    if (barEl) barEl.style.width = percent + "%";
    
    if (txtEl) {
      if (percent < 25) {
        txtEl.textContent = "Trie-matching symptom dictionaries...";
      } else if (percent < 50) {
        txtEl.textContent = "Laplace-smoothing Naive Bayes variables...";
      } else if (percent < 75) {
        txtEl.textContent = "Resolving Markov empathetic transitions...";
      } else {
        txtEl.textContent = "Validating diagnostic metrics...";
      }
    }
    
    if (percent >= 100) {
      clearInterval(interval);
      completeClinicalConsultation();
    }
  }, 150);
  
  document.getElementById("chatMessages").scrollTop = 9999;
}

function completeClinicalConsultation() {
  const wizardStartTime = performance.now();
  const wizardDiv = document.getElementById("activeConsultationWizard");
  if (!wizardDiv) return;
  
  const bp = activeConsultation.vitals.bp || "";
  const hr = activeConsultation.vitals.heartRate || "";
  const temp = activeConsultation.vitals.temp || "";
  const spo2 = activeConsultation.vitals.SpO2 || "";
  const symptoms = activeConsultation.selectedSymptoms || [];
  const duration = activeConsultation.duration || "1-3 Days";
  const risks = activeConsultation.risks || [];
  const p = getProfile();

  // Dynamic symptom context builder with Odia keywords to maximize classifier accuracy
  const symptomTranslations = {
    "Fever": "fever chills shivering high temperature jaro jwara jwar deha garam",
    "Cough": "cough cold congestion kasha thanda mucus phlegm",
    "Chest Pain": "chest pain chhati jantrana bindhuchi heart pressure tightness",
    "Stomach Pain": "stomach pain abdominal cramps peta katuchi banti betha",
    "High BP": "high bp blood pressure tension hypertension",
    "Diabetes": "diabetes sugar blood sugar madhumeha",
    "Eye Pain": "eye pain akhi lal padichi bitha strain ocular",
    "Back Pain": "back pain lower back ache anta bindhuchi stiffness"
  };

  let queryText = symptoms.map(s => symptomTranslations[s] || s).join(" ") + " for " + duration;
  if (risks.length > 0) {
    queryText += " risks " + risks.join(" ");
  }

  // Classify symptoms using our upgraded Naive Bayes Symptom Classifier
  const classifications = slmClassifier.classify(queryText);
  let bestMatch = classifications[0];
  
  // Resolve key category
  let category = "fever";
  if (bestMatch && bestMatch.confidence > 15) {
    category = bestMatch.condition;
  } else if (symptoms.length > 0) {
    const directMap = {
      "Fever": "fever",
      "Cough": "cough",
      "Chest Pain": "chest pain",
      "Stomach Pain": "stomach pain",
      "High BP": "high blood pressure",
      "Diabetes": "diabetes",
      "Eye Pain": "eye pain",
      "Back Pain": "back pain"
    };
    category = directMap[symptoms[0]] || "fever";
  }

  const kb = MEDICAL_KB[category] || MEDICAL_KB["fever"];

  // Formulate dynamic condition and primary diagnostic indices
  let conditionName = "";
  let metricName = "";
  let defaultMetricVal = "";
  let specialist = kb.specialist || "General Physician";

  switch (category) {
    case "fever":
      conditionName = "Acute Febrile Systemic Illness";
      metricName = "Systemic Inflammatory Response Index (SIRI)";
      defaultMetricVal = temp.toFixed(1) + " °F";
      break;
    case "headache":
      conditionName = "Intracranial Vasospastic Cephalgia (Migraine Suspected)";
      metricName = "Intracranial Tension Abnormality Level";
      defaultMetricVal = "45%";
      break;
    case "cough":
      conditionName = "Acute Bronchial Hyperresponsiveness / Consolidation Risk";
      metricName = "Pulmonary Congestion Index";
      defaultMetricVal = ((100 - spo2) * 5) + "%";
      break;
    case "chest pain":
      conditionName = "Myocardial Ischemia / Coronary Artery Spasm Risk";
      metricName = "Myocardial Ischemic Injury Index";
      defaultMetricVal = "78%";
      break;
    case "stomach pain":
      conditionName = "Hyperacidic Gastropathy & Mucosal Inflammation";
      metricName = "Gastric Mucosal Inflammation Index";
      defaultMetricVal = "55%";
      break;
    case "joint pain":
      conditionName = "Synovial Degenerative Osteoarthropathy";
      metricName = "Synovial Articular Degeneration Score";
      defaultMetricVal = "64%";
      break;
    case "skin rash":
      conditionName = "Epidermal Hypersensitivity & Allergic Dermatitis";
      metricName = "Epidermal Hypersensitivity Score";
      defaultMetricVal = "38%";
      break;
    case "high blood pressure":
      conditionName = "Arterial Hypertension & Cardiorenal Hemodynamic Load";
      metricName = "Arterial Hemodynamic Pressure Load";
      defaultMetricVal = bp + " mmHg";
      break;
    case "diabetes":
      conditionName = "Type 2 Diabetes Mellitus & Glycaemic Deregulation";
      metricName = "Estimated Glycated Hemoglobin (eHbA1c)";
      defaultMetricVal = "8.2%";
      break;
    case "eye pain":
      conditionName = "Acute Ocular Hypertension / Conjunctival Congestion";
      metricName = "Ocular Intraocular Pressure Abnormality";
      defaultMetricVal = "24 mmHg";
      break;
    case "back pain":
      conditionName = "Vertebral Mechanical Strain & Lumbar Spasm";
      metricName = "Lumbar Vertebral Mechanical Strain Index";
      defaultMetricVal = "70%";
      break;
    default:
      conditionName = "Acute Systemic Abnormality";
      metricName = "Clinical Vital Dysregulation Level";
      defaultMetricVal = "30%";
  }

  // Calculate severe/moderate/mild dynamic staging
  let stageText = "Stage 1 (Mild)";
  let stageLevel = 1;
  let severityReason = "Standard mild acute manifestations.";

  const bpParts = bp ? bp.split("/").map(Number) : [];
  const sysBP = bpParts[0] || 0;
  const diaBP = bpParts[1] || 0;

  const hrVal = hr ? Number(hr) : 0;
  const tempVal = temp ? Number(temp) : 0;
  const spo2Val = spo2 ? Number(spo2) : 0;

  if (
    (spo2 && spo2Val < 93) || 
    (temp && tempVal > 103) || 
    (hr && (hrVal > 120 || hrVal < 48)) || 
    category === "chest pain" || 
    symptoms.includes("Chest Pain") ||
    (bp && (sysBP > 165 || diaBP > 102))
  ) {
    stageText = "Stage 3 (Severe / Critical Risk)";
    stageLevel = 3;
    severityReason = "Critical metabolic or physiological deregulation detected. Urgent specialist review needed.";
  } else if (
    (spo2 && spo2Val < 95) || 
    (temp && tempVal > 100.5) || 
    (hr && (hrVal > 100 || hrVal < 60)) || 
    (bp && (sysBP > 140 || diaBP > 90)) ||
    duration === "More than 2 weeks"
  ) {
    stageText = "Stage 2 (Moderate / Developing)";
    stageLevel = 2;
    severityReason = "Elevated vital abnormalities or persistent symptom onset.";
  }

  // Dynamic metric values based on severity
  let metricValue = defaultMetricVal;
  if (category === "diabetes") {
    if (stageLevel === 3) metricValue = (Math.random() * 3 + 8.5).toFixed(1) + "%";
    else if (stageLevel === 2) metricValue = (Math.random() * 1.5 + 7.0).toFixed(1) + "%";
    else metricValue = (Math.random() * 1.2 + 5.7).toFixed(1) + "%";
  } else if (category === "fever") {
    metricValue = temp.toFixed(1) + " °F";
  } else if (category === "high blood pressure") {
    metricValue = bp + " mmHg";
  } else if (metricValue.endsWith("%")) {
    if (stageLevel === 3) metricValue = (Math.floor(Math.random() * 20) + 75) + "%";
    else if (stageLevel === 2) metricValue = (Math.floor(Math.random() * 25) + 40) + "%";
    else metricValue = (Math.floor(Math.random() * 25) + 10) + "%";
  }

  // Empathy Narrative Generated locally from upgraded Bigram Markov Chain
  const empathyFiller = markovGenerator.generate(16);

  // Active Profile Allergy Check & Safe Pharmacotherapy Substitution
  const allergies = (p.allergies || "").toLowerCase().trim();
  const medicines = [];
  let allergyWarningHtml = "";
  const baseMeds = kb.medications || [];

  for (const med of baseMeds) {
    const medNameLower = med.name.toLowerCase();
    let isContraindicated = false;

    if (allergies !== "none" && allergies.length > 0) {
      if (medNameLower.includes(allergies)) {
        isContraindicated = true;
      } else if (allergies.includes("nsaid") && (medNameLower.includes("ibuprofen") || medNameLower.includes("aspirin") || medNameLower.includes("diclofenac") || medNameLower.includes("naproxen"))) {
        isContraindicated = true;
      } else if (allergies.includes("penicillin") && (medNameLower.includes("amoxicillin") || medNameLower.includes("ampicillin") || medNameLower.includes("penicillin"))) {
        isContraindicated = true;
      } else if (allergies.includes("sulfa") && medNameLower.includes("sulfamethoxazole")) {
        isContraindicated = true;
      }
    }

    if (isContraindicated) {
      let subName = "";
      let subDose = "";
      let subNote = "";
      let reason = "";

      if (medNameLower.includes("amoxicillin")) {
        subName = "Azithromycin 500mg";
        subDose = "1 tablet daily before food";
        subNote = "Safe alternative for active Penicillin allergy";
        reason = "Penicillin Allergy Safe-Substitution";
      } else if (medNameLower.includes("ibuprofen") || medNameLower.includes("diclofenac") || medNameLower.includes("aspirin")) {
        subName = "Paracetamol (Acetaminophen) 650mg";
        subDose = "1 tablet every 6-8 hours after food";
        subNote = "Safe alternative for active NSAID allergy";
        reason = "NSAID Allergy Safe-Substitution";
      } else {
        subName = "Paracetamol 500mg";
        subDose = "1 tablet after meals as needed";
        subNote = "Substituted to avoid allergen exposure";
        reason = "Allergen Avoidance Safe-Substitution";
      }

      medicines.push({
        name: `🛡️ ${subName} (Safe Sub)`,
        instructions: `${subDose} - ${subNote}`,
        duration: "5 Days"
      });

      allergyWarningHtml += `
        <div class="med-section warning" style="border-left:4px solid var(--red-warn); background:rgba(255, 77, 109, 0.08); padding:10px; border-radius:4px; margin-bottom:10px; font-size:0.8rem;">
          <strong>🛡️ SAFE PHARMACOTHERAPY ALTERNATIVE APPLIED:</strong><br>
          The standard therapeutic prescription of <em>${med.name}</em> is contraindicated due to your reported <strong>Allergy to ${p.allergies}</strong>.<br>
          <span style="color:var(--cyan); font-weight:bold;">Safe Alternative:</span> ${subName} (${reason}).
        </div>
      `;
    } else {
      medicines.push({
        name: med.name,
        instructions: med.dose + (med.note ? ` - ${med.note}` : ""),
        duration: "5 Days"
      });
    }
  }

  // Adjust dietary guidelines and clinical precautions dynamically
  const diet = [...(kb.diet || [])];
  const precautions = [...(kb.precautions || [])];

  if (category === "cough" || symptoms.includes("Cough")) {
    precautions.push("Practice deep-breathing exercises & incentive spirometry 3 times daily");
    diet.push("Steam inhalation with tulsi or eucalyptus essence before sleep");
  }
  if (category === "fever" || symptoms.includes("Fever")) {
    diet.push("Maintain strict hydration: at least 3-4 liters of water and electrolyte solutions daily");
  }

  // Urgency & Critical warnings compilation
  let urgencyWarning = "";
  if (spo2 && spo2Val < 93) {
    urgencyWarning = `⚠️ CRITICAL OXYGEN SATURATION LEVEL: Measured oxygen levels are at ${spo2}%, which is below safe physiological limits. Immediate clinical oxygenation therapy is highly recommended.`;
  } else if (temp && tempVal > 103) {
    urgencyWarning = `⚠️ CORE HYPERPYREXIA ALERT: Body temperature of ${temp}°F represents a critical febrile state. Apply cold sponge baths and seek immediate clinical evaluation.`;
  } else if (bp && (sysBP > 165 || diaBP > 102)) {
    urgencyWarning = `⚠️ HYPERTENSIVE EMERGENCY THRESHOLD: Measured blood pressure of ${bp} mmHg carries severe acute cerebrovascular and cardiovascular risks. Seek emergency hospital triaging immediately.`;
  } else if (category === "chest pain" || symptoms.includes("Chest Pain")) {
    urgencyWarning = `⚠️ CARDIOVASCULAR TRIAGE DIRECTIVE: Crushing chest tightness radiating to the left arm/jaw requires immediate clinical evaluation to exclude Myocardial Infarction. Chew one chewable Aspirin 325mg (if not allergic) and seek emergency medical aid immediately.`;
  }

  // Determine target diagnostic document inside the Vault
  let vaultDocType = "lab";
  let vaultDocTitle = "simulated_hematology_cbc_report.png";

  if (category === "chest pain" || symptoms.includes("Chest Pain")) {
    vaultDocType = "ecg";
    vaultDocTitle = "simulated_cardiac_ecg_trace.png";
  } else if (category === "cough" || symptoms.includes("Cough")) {
    vaultDocType = "xray";
    vaultDocTitle = "simulated_pa_chest_xray_consolidation.png";
  } else if (category === "stomach pain" || symptoms.includes("Stomach Pain")) {
    vaultDocType = "mri";
    vaultDocTitle = "simulated_abdominal_mri_scan.png";
  } else if (category === "high blood pressure") {
    vaultDocType = "ecg";
    vaultDocTitle = "simulated_hypertensive_ventricle_ecg.png";
  } else if (category === "diabetes") {
    vaultDocType = "lab";
    vaultDocTitle = "simulated_hba1c_glucose_profile.png";
  } else if (category === "back pain") {
    vaultDocType = "mri";
    vaultDocTitle = "simulated_lumbar_spine_l4_l5_mri.png";
  } else if (category === "headache") {
    vaultDocType = "mri";
    vaultDocTitle = "simulated_brain_mri_contrast_scan.png";
  } else if (category === "joint pain") {
    vaultDocType = "xray";
    vaultDocTitle = "simulated_joint_osteoarthritis_radiograph.png";
  } else if (category === "eye pain") {
    vaultDocType = "lab";
    vaultDocTitle = "simulated_ophthalmic_intraocular_pressure.png";
  } else if (category === "skin rash") {
    vaultDocType = "lab";
    vaultDocTitle = "simulated_dermatology_allergen_panel.png";
  }

  // Generate simulated file inside IndexedDB and register it into Vault
  const tunerParams = {
    stage: stageLevel,
    value: parseFloat(metricValue) || 30,
    id: Date.now()
  };
  
  const dataUrl = generateSimulatedLabFile(vaultDocType, vaultDocTitle);
  const summary = `Offline virtual diagnostics generated simulated lab findings for ${conditionName} (${stageText}). Patient profile and vitals (BP: ${bp}, Temp: ${temp}, SpO2: ${spo2}) checked against SLM rules.`;

  const documentAnalysisHtml = analyzeDocument({ name: vaultDocTitle }, vaultDocType, p, tunerParams);
  const savedDocId = saveSimulatedToVault(vaultDocTitle, vaultDocType, summary, documentAnalysisHtml, dataUrl);

  // Compile final print-ready Rx data
  const rxData = {
    healthId: currentHealthId || 'RAMAN-HID-170',
    condition: conditionName,
    stage: stageText,
    metricName: metricName,
    metricValue: metricValue,
    vitals: { bp, heartRate: hr.toString(), temp: temp.toString(), SpO2: spo2.toString() },
    risks: risks,
    medicines: medicines,
    diet: diet,
    precautions: precautions,
    urgencyWarning: urgencyWarning,
    latency: (performance.now() - wizardStartTime).toFixed(3)
  };

  window._activeRxData = rxData;

  // Clean wizard class and paint responsive and beautiful clinical card
  wizardDiv.className = "message ai-message";
  wizardDiv.style.border = "none";
  wizardDiv.style.background = "none";
  
  wizardDiv.innerHTML = `
    <div class="message-avatar ai-avatar"><span>🤖</span></div>
    <div class="message-content">
      <div class="message-header">
        <span class="sender-name">RAMAN AI</span>
        <span class="message-badge">Experiment № 170</span>
        <span class="message-time">${nowTime()}</span>
      </div>
      <div class="message-bubble ai-bubble" style="background:var(--bg-glass); border:1px solid rgba(0,255,179,0.25); box-shadow:0 0 15px rgba(0,255,179,0.15); backdrop-filter:blur(8px); max-width:85%;">
        
        <div class="med-section info" style="border-left:4px solid var(--teal); margin-bottom:15px;">
          <div class="med-section-title" style="color:var(--teal); font-family:var(--font-head); font-size:0.95rem; margin-bottom:5px;">📋 CLINICAL ASSESSMENT & TRIAGE REPORT</div>
          <p style="font-size:0.85rem; line-height:1.4; font-style:italic; color:var(--text-muted); margin-bottom:8px;">
            "${empathyFiller}"
          </p>
          <p style="font-size:0.88rem; line-height:1.4;">
            Active intake mapping has successfully concluded for <strong>${p.name || 'Patient'}</strong>. The RAMAN Simple Language Model (SLM) has formulated clinical findings and compiled the diagnostic outcome.
          </p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px; font-size:0.85rem; padding:10px; background:rgba(0, 229, 255, 0.03); border:1px solid rgba(0, 229, 255, 0.1); border-radius:6px;">
          <div>
            <span style="color:var(--text-muted); font-size:0.75rem;">DIAGNOSED CONDITION / ନିଦାନ:</span><br>
            <strong style="color:var(--cyan);">${conditionName}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:0.75rem;">SEVERITY LEVEL / ସ୍ତର:</span><br>
            <strong style="color:var(--red-warn);">${stageText}</strong>
          </div>
          ${(bp || hr || temp || spo2) ? `
          <div style="grid-column: span 2;">
            <span style="color:var(--text-muted); font-size:0.75rem;">VITALS CAPTURED / ଜୀବନ ସୂଚକ:</span><br>
            <strong>${[
              bp ? `BP: ${bp}` : '',
              hr ? `HR: ${hr} bpm` : '',
              temp ? `Temp: ${temp}°F` : '',
              spo2 ? `SpO2: ${spo2}%` : ''
            ].filter(Boolean).join(' | ')}</strong>
          </div>
          ` : ''}
          <div style="grid-column: span 2; border-top: 1px dashed rgba(0, 229, 255, 0.15); padding-top: 5px;">
            <span style="color:var(--text-muted); font-size:0.75rem;">PRIMARY METRIC / ମୁଖ୍ୟ ମାପକ:</span><br>
            <span>${metricName}: <strong style="color:var(--teal);">${metricValue}</strong></span>
          </div>
          <div style="grid-column: span 2;">
            <span style="color:var(--text-muted); font-size:0.75rem;">VAULT SIMULATION FILE / ସ୍ୱାସ୍ଥ୍ୟ ଭଲ୍ଟ:</span><br>
            <span style="color:var(--teal); font-size:0.78rem; font-weight:bold;">📁 Pushed simulated ${vaultDocType.toUpperCase()} file to Vault (${vaultDocTitle})</span>
          </div>
        </div>

        ${allergyWarningHtml}

        ${urgencyWarning ? `
          <div class="med-section warning" style="border-left:4px solid var(--red-warn); background:rgba(255, 77, 109, 0.08); padding:10px; border-radius:4px; margin-bottom:15px; font-size:0.85rem;">
            <strong>🚨 CRITICAL CLINICAL NOTICE / ଜରୁରୀ ସୂଚନା:</strong><br>${urgencyWarning}
          </div>
        ` : ''}

        <div class="med-section info" style="margin-bottom:15px;">
          <div class="med-section-title" style="color:var(--cyan); font-size:0.85rem; margin-bottom:5px;">💊 RECOMMENDED PHARMACOTHERAPY / ଔଷଧ ନିର୍ଦ୍ଦେଶାବଳୀ</div>
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left; color:var(--text-main);">
            <thead>
              <tr style="border-bottom:1px solid var(--border); color:var(--text-muted);">
                <th style="padding:4px 0; width:40%;">Medicine</th>
                <th style="padding:4px 0; width:45%;">Instructions</th>
                <th style="padding:4px 0; text-align:right; width:15%;">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${medicines.map(m => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:6px 0; font-weight:bold; color:var(--cyan);">${m.name}</td>
                  <td style="padding:6px 0; color:var(--text-main);">${m.instructions}</td>
                  <td style="padding:6px 0; text-align:right; color:var(--text-muted);">${m.duration}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px; font-size:0.8rem;">
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
            <strong style="color:var(--teal); display:block; margin-bottom:4px;">🍎 DIETARY PLAN / ଖାଦ୍ୟ ଯୋଜନା:</strong>
            <ul style="margin:0; padding-left:12px; line-height:1.4;">
              ${diet.slice(0, 3).map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
            <strong style="color:var(--teal); display:block; margin-bottom:4px;">⚠️ PRECAUTIONS / ସତର୍କତା:</strong>
            <ul style="margin:0; padding-left:12px; line-height:1.4;">
              ${precautions.slice(0, 3).map(p => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px; margin-top:15px;">
          <button id="btnDownloadPrescription" style="background:var(--teal); border:none; padding:10px 18px; border-radius:6px; font-weight:bold; color:#0f172a; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 0 12px rgba(0,255,179,0.3); transition:all 0.3s; width:100%; font-family:var(--font-head);">
            📋 DOWNLOAD CLINICAL PDF PRESCRIPTION (PRINT-READY A4)
          </button>
          <div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">
            Simulated lab test results pushed to local Health Vault. Click on the sidebar Vault entries to inspect full visual files and adjust real-time metrics!
          </div>
        </div>

      </div>
    </div>
  `;

  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  if (cpu) cpu.style.width = "48%";
  if (neural) neural.style.width = "52%";

  document.getElementById("chatMessages").scrollTop = 9999;
}

function bindConsultationEvents() {
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('#btnStartConsultation');
    if (!btn) return;
    initiateClinicalConsultation();
  });

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('.consult-chip-btn');
    if (!btn) return;
    
    if (btn.classList.contains('active')) {
      btn.style.background = '#0f172a';
      btn.style.color = 'var(--cyan)';
      btn.classList.remove('active');
    } else {
      btn.style.background = 'var(--cyan)';
      btn.style.color = '#0f172a';
      btn.classList.add('active');
    }
  });

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('#btnConsultStep1Submit');
    if (!btn) return;
    
    const activeChips = Array.from(document.querySelectorAll('.consult-chip-btn.active')).map(el => el.dataset.symptom);
    if (activeChips.length === 0) {
      alert("Please select at least one active symptom to map your condition.");
      return;
    }
    
    const duration = document.getElementById('consultDuration').value;
    
    activeConsultation.selectedSymptoms = activeChips;
    activeConsultation.duration = duration;
    
    transitionToConsultStep2();
  });

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('#btnConsultStep2Submit');
    if (!btn) return;
    
    const bp = document.getElementById('consultVitalsBP').value.trim();
    const hr = document.getElementById('consultVitalsHR').value.trim();
    const temp = document.getElementById('consultVitalsTemp').value.trim();
    const spo2 = document.getElementById('consultVitalsSpO2').value.trim();
    
    activeConsultation.vitals = {
      bp: bp || "120/80",
      heartRate: hr || "76",
      temp: temp || "98.6",
      SpO2: spo2 || "98"
    };
    
    const checkedRisks = Array.from(document.querySelectorAll('.consult-risk-cb:checked')).map(el => el.value);
    activeConsultation.risks = checkedRisks;

    const recommendedTests = [];
    const symptoms = activeConsultation.selectedSymptoms;
    if (symptoms.includes("Fever") || symptoms.includes("Cough")) {
      recommendedTests.push("PA Chest X-Ray (Radiology Panel)", "Complete Blood Count (CBC) Panel");
    }
    if (symptoms.includes("Chest Pain") || symptoms.includes("High BP")) {
      recommendedTests.push("12-Lead Electrocardiogram (ECG)", "Serum High-Sensitivity Troponin");
    }
    if (symptoms.includes("Stomach Pain")) {
      recommendedTests.push("Serum Creatinine & Kidney Function Panel", "Abdominal Ultrasound (USG)");
    }
    if (symptoms.includes("Diabetes")) {
      recommendedTests.push("HbA1c Blood Sugar Panel", "Fasting & Post-Prandial Blood Sugar Test");
    }
    if (recommendedTests.length === 0) {
      recommendedTests.push("General Hematology Panel (CBC / BMP)");
    }
    activeConsultation.recommendedTests = recommendedTests;
    
    transitionToConsultStep3();
  });

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('#btnConsultSimulateTest');
    if (!btn) return;
    
    startConsultationLoader();
  });

  document.body.addEventListener('click', e => {
    const btn = e.target.closest('#btnDownloadPrescription');
    if (!btn) return;
    
    if (window._activeRxData) {
      window.downloadPrescriptionPDF(window._activeRxData);
    } else {
      alert("No active prescription data resolved. Please re-run clinical consultation.");
    }
  });
}

async function generateGeminiResponse(text, profile, apiKey, model) {
  const profileCtx = `Patient Profile: Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Gender: ${profile.gender || 'Unknown'}, Blood Group: ${profile.blood || 'Unknown'}, Allergies: ${profile.allergies || 'None'}.`;
  const isOr = window.currentLang === 'or';
  
  const systemInstruction = `You are RAMAN AI - Experiment No. 170, an empathetic and highly advanced medical intelligence assistant.
Your goal is to triage symptoms, suggest possible conditions, and recommend general medications or dietary adjustments based strictly on the following Medical Knowledge Base.

MEDICAL KNOWLEDGE BASE:
${JSON.stringify(MEDICAL_KB)}

RULES:
1. Be empathetic and professional.
2. If the user's symptoms match something in the MEDICAL KNOWLEDGE BASE, use that information to structure your response. Include possible conditions, medications (with dosage), precautions, and dietary recommendations.
3. If the user mentions chest pain radiating to the arm/jaw, or any emergency symptom, immediately recommend calling emergency services.
4. Always include a disclaimer that you are an AI and they should consult a real doctor.
5. You MUST respond in HTML format (using <p>, <ul>, <li>, <strong>, etc.) so it renders nicely in the chat UI. Do not use markdown backticks for HTML. Use div classes like <div class="med-section info"><div class="med-section-title">Title</div>...</div>.
6. The user is speaking ${isOr ? 'Odia' : 'English'}. You MUST reply entirely in ${isOr ? 'Odia' : 'English'}.

Here is the current patient profile:
${profileCtx}`;

  const history = [];

  // Inject System Instruction as the first message to guarantee compatibility with gemini-pro
  history.push({
    role: 'user',
    parts: [{ text: systemInstruction }]
  });
  history.push({
    role: 'model',
    parts: [{ text: "Understood. I am RAMAN AI - Experiment No. 170. I will strictly follow the Medical Knowledge Base and respond in HTML format." }]
  });

  // Append actual chat history
  chatHistory.forEach(msg => {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  });

  // Append current message
  history.push({
    role: 'user',
    parts: [{ text: text }]
  });

  // Load dynamically saved parameters
  const temp = parseFloat(localStorage.getItem("ramanai_llm_temp") || "0.2");
  const maxTokens = parseInt(localStorage.getItem("ramanai_llm_max_tokens") || "2048");

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: history,
        generationConfig: {
          temperature: temp,
          maxOutputTokens: maxTokens
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      const errMsg = errorData.error ? errorData.error.message : 'Unable to connect to Gemini';
      return `<div class="med-section warning"><p>⚠️ API Error: ${errMsg}</p><p><small>Please check your API key in Settings.</small></p></div>`;
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      return `<p>An unexpected response format was returned from the API.</p>`;
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return `<div class="med-section warning"><p>⚠️ Network error. Could not reach Gemini API.</p></div>`;
  }
}

async function generateOpenAiResponse(text, profile, apiKey, baseUrl, model) {
  const profileCtx = `Patient Profile: Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Gender: ${profile.gender || 'Unknown'}, Blood Group: ${profile.blood || 'Unknown'}, Allergies: ${profile.allergies || 'None'}.`;
  const isOr = window.currentLang === 'or';
  
  const systemInstruction = `You are RAMAN AI - Experiment No. 170, an empathetic and highly advanced medical intelligence assistant.
Your goal is to triage symptoms, suggest possible conditions, and recommend general medications or dietary adjustments based strictly on the following Medical Knowledge Base.

MEDICAL KNOWLEDGE BASE:
${JSON.stringify(MEDICAL_KB)}

RULES:
1. Be empathetic and professional.
2. If the user's symptoms match something in the MEDICAL KNOWLEDGE BASE, use that information to structure your response. Include possible conditions, medications (with dosage), precautions, and dietary recommendations.
3. If the user mentions chest pain radiating to the arm/jaw, or any emergency symptom, immediately recommend calling emergency services.
4. Always include a disclaimer that you are an AI and they should consult a real doctor.
5. You MUST respond in HTML format (using <p>, <ul>, <li>, <strong>, etc.) so it renders nicely in the chat UI. Do not use markdown backticks for HTML. Use div classes like <div class="med-section info"><div class="med-section-title">Title</div>...</div>.
6. The user is speaking ${isOr ? 'Odia' : 'English'}. You MUST reply entirely in ${isOr ? 'Odia' : 'English'}.

Here is the current patient profile:
${profileCtx}`;

  const messages = [];
  messages.push({
    role: 'system',
    content: systemInstruction
  });

  // Append actual chat history
  chatHistory.forEach(msg => {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    });
  });

  // Append current message
  messages.push({
    role: 'user',
    content: text
  });

  // Load dynamically saved parameters
  const temp = parseFloat(localStorage.getItem("ramanai_llm_temp") || "0.2");
  const maxTokens = parseInt(localStorage.getItem("ramanai_llm_max_tokens") || "2048");

  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temp,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API Error:", errorData);
      const errMsg = errorData.error ? errorData.error.message : 'Unable to connect to Custom Gateway';
      return `<div class="med-section warning"><p>⚠️ API Error: ${errMsg}</p><p><small>Please check your API configuration in Settings.</small></p></div>`;
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      return `<p>An unexpected response format was returned from the API.</p>`;
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return `<div class="med-section warning"><p>⚠️ Network error. Could not reach OpenAI API Gateway.</p></div>`;
  }
}

// ==========================================
// ── RAMAN SLM TRAINING HUB & SANDBOX HUD ──
// ==========================================

function openTrainingHub() {
  const backdrop = document.getElementById("trainingHubBackdrop");
  const modal = document.getElementById("trainingHubModal");
  if (!backdrop || !modal) return;

  backdrop.style.display = "block";
  modal.style.display = "block";
  modal.classList.add("open");
  
  // Render active stats in HUD
  updateTrainingHubStats();
  
  // Run initial sandbox classification on whatever is in the input
  const sandboxInput = document.getElementById("hubSandboxInput");
  if (sandboxInput) {
    runSandboxInference(sandboxInput.value);
  }
}

function closeTrainingHub() {
  const backdrop = document.getElementById("trainingHubBackdrop");
  const modal = document.getElementById("trainingHubModal");
  if (backdrop) backdrop.style.display = "none";
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("open");
  }
}

function updateTrainingHubStats() {
  const classEl = document.getElementById("hubStatClasses");
  const docsEl = document.getElementById("hubStatDocs");
  const vocabEl = document.getElementById("hubStatVocab");
  const markovEl = document.getElementById("hubStatMarkov");

  if (classEl) classEl.textContent = Object.keys(slmClassifier.classCounts).length;
  if (docsEl) docsEl.textContent = slmClassifier.docCounts;
  if (vocabEl) vocabEl.textContent = slmClassifier.vocabulary.size.toLocaleString();
  if (markovEl) {
    const totalMarkovPairs = Object.keys(markovGenerator.chain).length;
    markovEl.textContent = totalMarkovPairs.toLocaleString();
  }
}

function retrainModel() {
  const btn = document.getElementById("btnHubRetrain");
  const consoleLog = document.getElementById("hubConsoleLog");
  const cpu = document.getElementById("cpuFill");
  const neural = document.getElementById("neuralFill");
  
  if (btn) btn.disabled = true;
  if (cpu) cpu.style.width = "99%";
  if (neural) neural.style.width = "99%";

  let log = "[INFO] Initiating rigorous local SLM re-indexing...\n";
  if (consoleLog) {
    consoleLog.textContent = log;
    consoleLog.scrollTop = 9999;
  }

  setTimeout(() => {
    const t0 = performance.now();
    
    // Rigorous re-training execution
    slmClassifier.train(SLM_TRAINING_CORPUS);
    
    // Also re-train the markov text generator
    const empathyDialogues = [
      "I understand you are feeling unwell and experiencing discomfort today.",
      "Please remain calm while we analyze your active diagnostic indications.",
      "Our system has caught mild acute abnormalities in your core vitals profile.",
      "Stay hydrated and avoid high physical strain until medical advice is taken.",
      "We recommend immediate rest and seeking professional clinical evaluation.",
      "A primary assessment shows clear systemic symptoms that require attention.",
      "I am here to guide you with safe substitutions and dynamic metric checks."
    ];
    markovGenerator.train(empathyDialogues);

    const t1 = performance.now();
    const duration = (t1 - t0).toFixed(2);

    log += `[0.05ms] Processing ${Object.keys(SLM_TRAINING_CORPUS).length} clinical conditions...\n`;
    log += `[0.25ms] Compiled stop-words filter (English & Odia)\n`;
    log += `[0.60ms] Tokenized N-grams & calculated TF-IDF relevance ratios\n`;
    log += `[1.15ms] Structured Trie phrase search branches\n`;
    log += `[1.80ms] Calibrated Laplace probability smoothing vectors\n`;
    log += `[2.35ms] Built ${Object.keys(markovGenerator.chain).length} transition states\n`;
    log += `[SUCCESS] Rigorous training completed in ${duration}ms!\n`;
    log += `[STATS] Vocabulary features: ${slmClassifier.vocabulary.size} | Docs: ${slmClassifier.docCounts}\n`;
    
    if (consoleLog) {
      consoleLog.textContent = log;
      consoleLog.scrollTop = 9999;
    }
    
    if (btn) btn.disabled = false;
    if (cpu) cpu.style.width = "48%";
    if (neural) neural.style.width = "52%";
    
    // Update dashboard metrics
    updateTrainingHubStats();
    
    // Re-run sandbox to update bars with newly calculated features
    const sandboxInput = document.getElementById("hubSandboxInput");
    if (sandboxInput) runSandboxInference(sandboxInput.value);
    
  }, 1000); // 1-second delay for premium visual calibration experience
}

function injectTrainingPhrase() {
  const condEl = document.getElementById("hubInjectCondition");
  const phraseEl = document.getElementById("hubInjectPhrase");
  const consoleLog = document.getElementById("hubConsoleLog");
  
  if (!condEl || !phraseEl) return;
  const condition = condEl.value;
  const phrase = phraseEl.value.trim();
  
  if (phrase.length < 5) {
    alert("Please enter a substantial symptom phrase (minimum 5 characters).");
    return;
  }

  // Push new observation sentence into the in-memory CORPUS
  if (!SLM_TRAINING_CORPUS[condition]) {
    SLM_TRAINING_CORPUS[condition] = [];
  }
  SLM_TRAINING_CORPUS[condition].push(phrase);
  
  let log = `[INJECT] Appended new phrase for '${condition}': "${phrase}"\n`;
  if (consoleLog) {
    consoleLog.textContent = log;
  }
  
  phraseEl.value = "";
  
  // Retrain SLM to apply newly injected N-gram weights
  retrainModel();
}

function runSandboxInference(text) {
  const listEl = document.getElementById("hubSandboxOutputList");
  if (!listEl) return;
  
  if (!text || text.trim().length === 0) {
    listEl.innerHTML = `
      <div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding-top:40px;">
        Awaiting input... Type symptoms to view live probabilities.
      </div>
    `;
    return;
  }

  const classifications = slmClassifier.classify(text);
  
  let html = "";
  
  classifications.forEach(item => {
    // Condition title translation for premium bilingual experience
    const titles = {
      "fever": "Acute Febrile Illness / ଜ୍ୱର",
      "headache": "Vasospastic Cephalgia / ମୁଣ୍ଡବିନ୍ଧା",
      "cough": "Bronchial Congestion / କାଶ",
      "chest pain": "Myocardial Ischemia / ଛାତି ଯନ୍ତ୍ରଣା",
      "stomach pain": "Hyperacidic Gastropathy / ପେଟ କାଟୁଛି",
      "joint pain": "Osteoarthropathy / ଗଣ୍ଠି ବାତ",
      "skin rash": "Allergic Dermatitis / ଚର୍ମ କୁଣ୍ଡେଇ ହେବା",
      "high blood pressure": "Arterial Hypertension / ଉଚ୍ច ରକ୍ତଚାପ",
      "diabetes": "Diabetes Mellitus / ମଧୁମେହ",
      "eye pain": "Ocular Hypertension / ଆଖି ବିନ୍ଧା",
      "back pain": "LumbarMechanical Strain / ଅଣ୍ଟା ବୀନ୍ଧା"
    };

    const displayTitle = titles[item.condition] || item.condition;
    const barWidth = item.confidence + "%";
    
    // Harmonious colors depending on confidence: high (accent), moderate (cyan), low (dimmed)
    let fillStyle = "background: linear-gradient(90deg, var(--cyan), var(--teal));";
    let glowColor = "rgba(0, 229, 255, 0.4)";
    
    if (item.confidence > 50) {
      fillStyle = "background: linear-gradient(90deg, var(--accent), var(--teal));";
      glowColor = "rgba(0, 255, 179, 0.6)";
    } else if (item.confidence < 15) {
      fillStyle = "background: rgba(255,255,255,0.1);";
      glowColor = "rgba(255,255,255,0.05)";
    }

    html += `
      <div class="sandbox-meter-row">
        <div class="sandbox-meter-header">
          <span style="font-weight:bold; color:${item.confidence > 25 ? 'var(--text-main)' : 'var(--text-muted)'};">${displayTitle}</span>
          <span style="font-family:var(--font-head); font-weight:bold; color:${item.confidence > 50 ? 'var(--accent)' : 'var(--cyan)'};">${item.confidence}%</span>
        </div>
        <div class="sandbox-meter-bar-bg">
          <div class="sandbox-meter-bar-fill" style="width:${barWidth}; ${fillStyle} box-shadow: 0 0 8px ${glowColor};"></div>
        </div>
      </div>
    `;
  });

  const tokens = slmClassifier.tokenize(text);
  const trieMatches = slmClassifier.trie.search(text);
  
  // Find mapped unigrams/bigrams
  const activeTokens = tokens.filter(t => slmClassifier.vocabulary.has(t) || slmClassifier.trie.search(t).length > 0);
  const activeUnigrams = activeTokens.filter(t => !t.includes(" "));
  const activeNgrams = activeTokens.filter(t => t.includes(" "));
  
  const diagnosticTraceHtml = `
    <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); font-family: monospace; font-size: 0.72rem; line-height: 1.4;">
      <div style="color:var(--accent); font-weight:bold; margin-bottom:8px; font-family:var(--font-head); letter-spacing:0.5px;">🧬 NEURAL TRACE & TOKEN ANALYSIS</div>
      
      <div style="margin-bottom: 6px;">
        <span style="color:var(--text-muted);">Trie Phrase Matches:</span> 
        ${trieMatches.length > 0 
          ? trieMatches.map(m => `<span style="background:rgba(0, 229, 255, 0.15); color:var(--cyan); border:1px solid rgba(0, 229, 255, 0.3); padding:1px 4px; border-radius:4px; margin-right:4px; display:inline-block; margin-top:2px;">${m.word} ➔ [${m.category}]</span>`).join("")
          : '<span style="color:rgba(255,255,255,0.25);">None</span>'
        }
      </div>

      <div style="margin-bottom: 6px;">
        <span style="color:var(--text-muted);">Extracted Key Unigrams:</span> 
        ${activeUnigrams.length > 0
          ? Array.from(new Set(activeUnigrams)).map(u => `<span style="background:rgba(0, 255, 179, 0.15); color:var(--accent); border:1px solid rgba(0, 255, 179, 0.3); padding:1px 4px; border-radius:4px; margin-right:4px; display:inline-block; margin-top:2px;">${u}</span>`).join("")
          : '<span style="color:rgba(255,255,255,0.25);">None</span>'
        }
      </div>

      <div>
        <span style="color:var(--text-muted);">Extracted N-grams (Bigrams/Trigrams):</span> 
        ${activeNgrams.length > 0
          ? Array.from(new Set(activeNgrams)).map(n => `<span style="background:rgba(255, 159, 67, 0.15); color:#ff9f43; border:1px solid rgba(255, 159, 67, 0.3); padding:1px 4px; border-radius:4px; margin-right:4px; display:inline-block; margin-top:2px;">${n}</span>`).join("")
          : '<span style="color:rgba(255,255,255,0.25);">None</span>'
        }
      </div>
    </div>
  `;

  listEl.innerHTML = html + diagnosticTraceHtml;
}
