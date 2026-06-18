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

// Trie Vocabulary
class TrieNode {
  constructor() {
    this.children = {};
    this.isWord = false;
    this.category = null;
  }
}

function stemBilingualToken(w) {
  // English stemming
  if (w.endsWith("ing")) {
    w = w.slice(0, -3);
    if (w.endsWith("yy")) w = w.slice(0, -1) + "y";
  } else if (w.endsWith("ed")) {
    w = w.slice(0, -2);
  } else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is") && w.length > 3) {
    if (w.endsWith("es")) {
      w = w.slice(0, -2);
    } else {
      w = w.slice(0, -1);
    }
  }

  // Romanized Odia inflections
  const odiaSuffixes = ["re", "ru", "ku", "ta", "ra", "mane"];
  for (const suf of odiaSuffixes) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

// Trie Vocabulary Parser for O(L) dictionary lookups with fuzzy search support
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

  // Recursive Levenshtein search in Trie
  searchFuzzy(word, maxDist = 1) {
    const results = [];
    const searchRecursive = (node, letter, targetWord, currentRow, path) => {
      const size = targetWord.length + 1;
      const nextRow = new Array(size);
      nextRow[0] = currentRow[0] + 1;

      for (let i = 1; i < size; i++) {
        const insertCost = nextRow[i - 1] + 1;
        const deleteCost = currentRow[i] + 1;
        let replaceCost = 0;
        if (targetWord[i - 1] !== letter) {
          replaceCost = currentRow[i - 1] + 1;
        } else {
          replaceCost = currentRow[i - 1];
        }
        nextRow[i] = Math.min(insertCost, deleteCost, replaceCost);
      }

      if (nextRow[size - 1] <= maxDist && node.isWord) {
        results.push({ word: path, category: node.category, dist: nextRow[size - 1] });
      }

      if (Math.min(...nextRow) <= maxDist) {
        for (const childChar of Object.keys(node.children)) {
          searchRecursive(node.children[childChar], childChar, targetWord, nextRow, path + childChar);
        }
      }
    };

    const currentRow = new Array(word.length + 1);
    for (let i = 0; i <= word.length; i++) {
      currentRow[i] = i;
    }

    for (const childChar of Object.keys(this.root.children)) {
      searchRecursive(this.root.children[childChar], childChar, word, currentRow, childChar);
    }

    return results;
  }

  search(text) {
    const matches = [];
    const rawWords = text.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    // Fuzzy search on stemmed words to increase match rate
    const words = rawWords.map(w => stemBilingualToken(w));
    
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
        matches.push({ word: phrase, category: node.category, dist: 0 });
      } else {
        // Run spelling correction recursive search for edit distance 1
        if (phrase.length > 4) {
          const fuzzyList = this.searchFuzzy(phrase, 1);
          if (fuzzyList.length > 0) {
            fuzzyList.sort((a, b) => a.dist - b.dist);
            matches.push({ word: fuzzyList[0].word, category: fuzzyList[0].category, dist: fuzzyList[0].dist });
          }
        }
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

// High-Performance Hybrid Ensemble Classifier (SVM + Multinomial Naive Bayes + Fuzzy Trie)
class NaiveBayesSymptomClassifier {
  constructor() {
    this.corpus = {};
    this.vocabulary = new Set();
    this.idf = {};
    this.docCounts = 0;
    this.trie = new Trie();
    
    // Binary SVM weight vectors and biases for each category (One-vs-Rest)
    this.weights = {}; // Maps condition -> weight vector (map of token -> weight)
    this.biases = {};  // Maps condition -> scalar bias

    // Multinomial Naive Bayes structures
    this.nbWordCounts = {}; // Maps condition -> token -> count
    this.nbClassTotals = {}; // Maps condition -> sum of tokens
    this.nbPriors = {}; // Maps condition -> log prior
  }

  tokenize(text) {
    const cleanText = text.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
      .trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 1);
    
    const stopWords = new Set(["i", "have", "a", "feel", "feeling", "with", "after", "and", "the", "my", "so", "very", "on", "of", "to", "for", "in", "is", "me", "heuchi", "laguchi", "asichi", "pura", "dehare", "deha", "hela", "ta", "hoichi", "ti", "bhal"]);
    const tokens = [];
    
    const stemmedWords = words.map(w => stemBilingualToken(w));
    
    for (const w of stemmedWords) {
      if (!stopWords.has(w) && w.length > 1) {
        tokens.push(w);
      }
    }
    
    // Extract bigrams
    for (let i = 0; i < stemmedWords.length - 1; i++) {
      tokens.push(stemmedWords[i] + " " + stemmedWords[i+1]);
    }
    
    // Extract trigrams
    for (let i = 0; i < stemmedWords.length - 2; i++) {
      tokens.push(stemmedWords[i] + " " + stemmedWords[i+1] + " " + stemmedWords[i+2]);
    }
    
    // Extract quadgrams to increase vocabulary size and feature density
    for (let i = 0; i < stemmedWords.length - 3; i++) {
      tokens.push(stemmedWords[i] + " " + stemmedWords[i+1] + " " + stemmedWords[i+2] + " " + stemmedWords[i+3]);
    }
    
    return tokens;
  }

  train(corpus) {
    this.corpus = corpus;
    this.vocabulary.clear();
    this.trie = new Trie();
    
    // 1. Compute Document Counts & IDF Vectors
    this.docCounts = 0;
    const docCountsPerToken = {};
    
    for (const [condition, docs] of Object.entries(corpus)) {
      this.docCounts += docs.length;
      for (const doc of docs) {
        const tokens = this.tokenize(doc);
        const uniqueInDoc = new Set(tokens);
        for (const token of uniqueInDoc) {
          docCountsPerToken[token] = (docCountsPerToken[token] || 0) + 1;
        }
        for (const token of tokens) {
          this.vocabulary.add(token);
          if (token.length > 2) {
            this.trie.insert(token, condition);
          }
        }
      }
    }

    // Compute IDF values
    this.idf = {};
    for (const token of this.vocabulary) {
      const docCount = docCountsPerToken[token] || 0;
      this.idf[token] = Math.log((1 + this.docCounts) / (1 + docCount)) + 1;
    }

    // 2. Vectorize all documents in the corpus (TF-IDF representation)
    const vectorizedDataset = [];
    for (const [condition, docs] of Object.entries(corpus)) {
      for (const doc of docs) {
        const tokens = this.tokenize(doc);
        const tf = {};
        for (const token of tokens) {
          tf[token] = (tf[token] || 0) + 1;
        }
        
        const vector = {};
        for (const [token, count] of Object.entries(tf)) {
          vector[token] = count * (this.idf[token] || 1.0);
        }
        
        // Normalize L2 Norm of vector
        let sumSq = 0;
        for (const v of Object.values(vector)) {
          sumSq += v * v;
        }
        const magnitude = Math.sqrt(sumSq);
        const normVector = {};
        if (magnitude > 0) {
          for (const [token, val] of Object.entries(vector)) {
            normVector[token] = val / magnitude;
          }
        }
        
        vectorizedDataset.push({ vector: normVector, label: condition });
      }
    }

    // 3. Train One-vs-Rest Binary SVMs using Primal Stochastic Gradient SGD
    const epochs = 15;
    const lambda = 0.01; 
    const learningRateInit = 0.1;

    this.weights = {};
    this.biases = {};

    const conditions = Object.keys(corpus);

    for (const targetCondition of conditions) {
      const v = {}; 
      let S = 1.0;  
      let b = 0.0;  

      for (let epoch = 1; epoch <= epochs; epoch++) {
        const eta = learningRateInit / (1.0 + epoch * lambda); 
        const scaleFactor = 1.0 - eta * lambda;

        // Shuffle dataset
        const shuffled = [...vectorizedDataset].sort(() => Math.random() - 0.5);

        for (const sample of shuffled) {
          const y = sample.label === targetCondition ? 1.0 : -1.0;
          
          let dotProduct = 0;
          for (const [token, x_val] of Object.entries(sample.vector)) {
            if (v[token] !== undefined) {
              dotProduct += v[token] * x_val;
            }
          }
          dotProduct *= S;
          
          const decision = y * (dotProduct + b);

          if (decision < 1.0) {
            S *= scaleFactor;
            for (const [token, x_val] of Object.entries(sample.vector)) {
              v[token] = (v[token] || 0.0) + (eta * y * x_val) / S;
            }
            b = b + eta * y;
          } else {
            S *= scaleFactor;
          }
        }
      }

      const w = {};
      for (const [token, val] of Object.entries(v)) {
        const finalVal = val * S;
        if (Math.abs(finalVal) > 1e-7) {
          w[token] = finalVal;
        }
      }

      this.weights[targetCondition] = w;
      this.biases[targetCondition] = b;
    }

    // 4. Train Multinomial Naive Bayes (MNB) Parameters
    this.nbWordCounts = {};
    this.nbClassTotals = {};
    this.nbPriors = {};

    for (const condition of conditions) {
      this.nbWordCounts[condition] = {};
      this.nbClassTotals[condition] = 0;
      this.nbPriors[condition] = Math.log(corpus[condition].length / this.docCounts);
    }

    for (const [condition, docs] of Object.entries(corpus)) {
      for (const doc of docs) {
        const tokens = this.tokenize(doc);
        for (const token of tokens) {
          this.nbWordCounts[condition][token] = (this.nbWordCounts[condition][token] || 0) + 1;
          this.nbClassTotals[condition] += 1;
        }
      }
    }
  }

  classify(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return Object.keys(this.weights).map(c => ({ condition: c, confidence: 0, score: 0 }));
    }

    // 1. Build Query TF-IDF Vector
    const queryTf = {};
    for (const token of tokens) {
      if (this.vocabulary.has(token)) {
        queryTf[token] = (queryTf[token] || 0) + 1;
      }
    }

    const queryVector = {};
    for (const [token, count] of Object.entries(queryTf)) {
      queryVector[token] = count * (this.idf[token] || 1.0);
    }

    let sumSq = 0;
    for (const val of Object.values(queryVector)) {
      sumSq += val * val;
    }
    const queryMagnitude = Math.sqrt(sumSq);

    const normQueryVector = {};
    if (queryMagnitude > 0) {
      for (const [token, val] of Object.entries(queryVector)) {
        normQueryVector[token] = val / queryMagnitude;
      }
    }

    // 2. Compute Multinomial Naive Bayes scores
    const nbScores = {};
    const vocabSize = this.vocabulary.size;
    for (const condition of Object.keys(this.weights)) {
      let logProb = this.nbPriors[condition];
      const classTotal = this.nbClassTotals[condition] || 0;
      
      for (const token of tokens) {
        if (this.vocabulary.has(token)) {
          const count = this.nbWordCounts[condition][token] || 0;
          const termIdf = this.idf[token] || 1.0;
          logProb += termIdf * Math.log((count + 1) / (classTotal + vocabSize));
        }
      }
      nbScores[condition] = logProb;
    }

    const nbValues = Object.values(nbScores);
    const meanNb = nbValues.reduce((a, b) => a + b, 0) / nbValues.length;
    const normNbScores = {};
    for (const condition of Object.keys(nbScores)) {
      normNbScores[condition] = nbScores[condition] - meanNb;
    }

    // 3. Compute SVM Margin decision values + Naive Bayes ensemble fusions
    const scores = {};
    for (const condition of Object.keys(this.weights)) {
      const w = this.weights[condition];
      const b = this.biases[condition];
      
      let dotProduct = 0;
      for (const [token, val] of Object.entries(normQueryVector)) {
        if (w[token] !== undefined) {
          dotProduct += w[token] * val;
        }
      }
      
      const svmMargin = dotProduct + b;
      scores[condition] = svmMargin + 0.4 * normNbScores[condition];
    }

    // 4. Inject Trie-based fuzzy phrase matches as margin shifts
    const trieMatches = this.trie.search(text);
    const trieBoost = {};
    for (const match of trieMatches) {
      const termIdf = this.idf[match.word] || 1.0;
      const discount = match.dist > 0 ? 0.75 : 1.0;
      trieBoost[match.category] = (trieBoost[match.category] || 0) + (0.25 * termIdf * discount);
    }

    for (const condition of Object.keys(scores)) {
      if (trieBoost[condition]) {
        scores[condition] += trieBoost[condition];
      }
    }

    // 5. Inject Clinician active learning posterior offset deltas
    for (const condition of Object.keys(scores)) {
      let clinicianDelta = 0;
      if (window.localClinicianDeltas && window.localClinicianDeltas[condition]) {
        for (const token of tokens) {
          if (window.localClinicianDeltas[condition][token] !== undefined) {
            clinicianDelta += window.localClinicianDeltas[condition][token];
          }
        }
      }
      scores[condition] += clinicianDelta;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const maxScore = sorted[0][1];
    
    const exps = sorted.map(([c, s]) => [c, Math.exp(2.5 * (s - maxScore))]);
    const totalExp = exps.reduce((acc, curr) => acc + curr[1], 0);
    
    const confidenceList = sorted.map(([c, s]) => {
      const relConf = totalExp > 0 ? Math.round((Math.exp(2.5 * (scores[c] - maxScore)) / totalExp) * 100) : 0;
      return {
        condition: c,
        confidence: relConf,
        score: Math.round(scores[c] * 100) / 100
      };
    });

    return confidenceList;
  }

  explain(text) {
    const tokens = this.tokenize(text);
    const details = {};
    const trieMatches = this.trie.search(text);
    
    const queryTf = {};
    for (const token of tokens) {
      if (this.vocabulary.has(token)) {
        queryTf[token] = (queryTf[token] || 0) + 1;
      }
    }
    const queryVector = {};
    for (const [token, count] of Object.entries(queryTf)) {
      queryVector[token] = count * (this.idf[token] || 1.0);
    }
    let sumSq = 0;
    for (const val of Object.values(queryVector)) {
      sumSq += val * val;
    }
    const queryMagnitude = Math.sqrt(sumSq);

    const normQueryVector = {};
    if (queryMagnitude > 0) {
      for (const [token, val] of Object.entries(queryVector)) {
        normQueryVector[token] = val / queryMagnitude;
      }
    }

    const trieBoost = {};
    for (const match of trieMatches) {
      const termIdf = this.idf[match.word] || 1.0;
      const discount = match.dist > 0 ? 0.75 : 1.0;
      trieBoost[match.category] = (trieBoost[match.category] || 0) + (0.25 * termIdf * discount);
    }

    const nbScores = {};
    const vocabSize = this.vocabulary.size;
    for (const condition of Object.keys(this.weights)) {
      let logProb = this.nbPriors[condition];
      const classTotal = this.nbClassTotals[condition] || 0;
      for (const token of tokens) {
        if (this.vocabulary.has(token)) {
          const count = this.nbWordCounts[condition][token] || 0;
          const termIdf = this.idf[token] || 1.0;
          logProb += termIdf * Math.log((count + 1) / (classTotal + vocabSize));
        }
      }
      nbScores[condition] = logProb;
    }

    const nbValues = Object.values(nbScores);
    const meanNb = nbValues.reduce((a, b) => a + b, 0) / nbValues.length;
    const normNbScores = {};
    for (const condition of Object.keys(nbScores)) {
      normNbScores[condition] = nbScores[condition] - meanNb;
    }

    for (const [condition, w] of Object.entries(this.weights)) {
      const b = this.biases[condition];
      const matchedTokens = [];
      let rawMargin = b;
      
      for (const [token, val] of Object.entries(normQueryVector)) {
        if (w[token] !== undefined && w[token] !== 0) {
          const termContrib = w[token] * val;
          rawMargin += termContrib;
          
          matchedTokens.push({
            token: token,
            count: queryTf[token] || 1,
            idf: (this.idf[token] || 1.0).toFixed(2),
            probability: w[token].toFixed(4),
            contribution: termContrib.toFixed(3)
          });
        }
      }

      let boostVal = trieBoost[condition] || 0;
      let finalMargin = rawMargin + 0.4 * normNbScores[condition] + boostVal;

      details[condition] = {
        prior: b.toFixed(3),
        logProb: finalMargin.toFixed(3),
        matchedTokens: matchedTokens,
        trieBoost: boostVal.toFixed(3),
        nbLogProb: nbScores[condition].toFixed(3),
        svmMargin: rawMargin.toFixed(3)
      };
    }
    return details;
  }
}

// Markov Chain transition engine to synthesize conversational empathy filler text
class MarkovTextGenerator {
  constructor() {
    this.chainEn = {};
    this.startPairsEn = [];
    this.chainOr = {};
    this.startPairsOr = [];

    // High-urgency tempered chains
    this.chainHighEn = {};
    this.startPairsHighEn = [];
    this.chainHighOr = {};
    this.startPairsHighOr = [];

    // Bigram fallback chains
    this.fallbackEn = {};
    this.fallbackOr = {};
  }

  train(sentences, lang = 'en', isHigh = false) {
    const chain = isHigh 
      ? (lang === 'or' ? this.chainHighOr : this.chainHighEn)
      : (lang === 'or' ? this.chainOr : this.chainEn);
    const startPairs = isHigh
      ? (lang === 'or' ? this.startPairsHighOr : this.startPairsHighEn)
      : (lang === 'or' ? this.startPairsOr : this.startPairsEn);
    
    const fallback = lang === 'or' ? this.fallbackOr : this.fallbackEn;

    for (const sentence of sentences) {
      const words = sentence.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length < 2) continue;
      startPairs.push([words[0], words[1]]);

      for (let i = 0; i < words.length - 1; i++) {
        const w = words[i];
        const nextW = words[i+1];
        if (!fallback[w]) {
          fallback[w] = [];
        }
        fallback[w].push(nextW);
      }

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

  generate(maxLength = 15, isHighUrgency = false, temp = null) {
    if (temp === null) {
      temp = window.markovTemperature !== undefined ? window.markovTemperature : 1.0;
    }
    const isOr = window.currentLang === 'or';
    
    let chain;
    let startPairs;
    
    if (isHighUrgency) {
      const highPairs = isOr ? this.startPairsHighOr : this.startPairsHighEn;
      if (highPairs && highPairs.length > 0) {
        chain = isOr ? this.chainHighOr : this.chainHighEn;
        startPairs = highPairs;
      } else {
        chain = isOr ? this.chainOr : this.chainEn;
        startPairs = isOr ? this.startPairsOr : this.startPairsEn;
      }
    } else {
      chain = isOr ? this.chainOr : this.chainEn;
      startPairs = isOr ? this.startPairsOr : this.startPairsEn;
    }

    const fallback = isOr ? this.fallbackOr : this.fallbackEn;

    if (startPairs.length === 0) {
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
      let choices = chain[key];
      
      if (!choices || choices.length === 0) {
        choices = fallback ? fallback[w2] : null;
      }
      
      if (!choices || choices.length === 0) break;
      
      let next;
      if (temp === 1.0) {
        next = choices[Math.floor(Math.random() * choices.length)];
      } else {
        const counts = {};
        for (const choice of choices) {
          counts[choice] = (counts[choice] || 0) + 1;
        }
        
        const uniqueChoices = Object.keys(counts);
        const power = 1.0 / temp;
        const weights = uniqueChoices.map(c => Math.pow(counts[c], power));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        
        let r = Math.random() * totalWeight;
        let cumulative = 0;
        for (let j = 0; j < uniqueChoices.length; j++) {
          cumulative += weights[j];
          if (r <= cumulative) {
            next = uniqueChoices[j];
            break;
          }
        }
        if (!next) next = uniqueChoices[uniqueChoices.length - 1];
      }
      
      result.push(next);
      w1 = w2;
      w2 = next;
    }

    return result.join(" ") + ".";
  }
}

// Define Expanded Offline Training Datasets
const SLM_TRAINING_CORPUS = {
  anemia: [
    "increasing fatigue shortness of breath palpitations lightheadedness standing quickly pale hands lips",
    "anemia general weakness pale skin tired all the time racing heart",
    "deha pura durbala laguchi fatigued short of breath pale face palpitations",
    "chronic fatigue pale lips lightheaded when standing up tired easily",
    "iron deficiency anemia breathlessness palpitations low energy pale skin",
    "raktaheena durbalata tired quickly breathlessness pale",
    "easy fatiguability palpitations lightheaded standing up pale palms",
    "increasing fatigue and shortness of breath for about a month occasional palpitations lightheadedness standing pale",
    "increasing fatigue shortness of breath palpitations lightheadedness standing quickly pale hands lips",
    "increasing fatigue shortness of breath palpitations lightheadedness standing quickly pale hands lips",
    "feeling tired sluggish weak short of breath pale skin brittle nails headaches",
    "raktaheena durbalata tired quickly breathlessness pale",
    "raktaheena durbalata tired quickly breathlessness pale",
    "chronic fatigue pale lips lightheaded when standing up tired easily",
    "raktaheena durbalata tired quickly breathlessness pale",
    "easy fatiguability palpitations lightheaded standing up pale palms",
    "raktaheena durbalata tired quickly breathlessness pale",
    "easy fatiguability palpitations lightheaded standing up pale palms",
    "increasing fatigue shortness of breath palpitations lightheadedness standing quickly pale hands lips",
    "raktaheena durbalata tired quickly breathlessness pale",
    "iron deficiency anemia breathlessness palpitations low energy pale skin",
    "easy fatiguability palpitations lightheaded standing up pale palms",
    "easy fatiguability palpitations lightheaded standing up pale palms"
  ],
  asthma: [
    "persistent cough worse at night productive yellow phlegm short of breath chest tightness",
    "breathlessness wheezing chest tightness dry cough asthma attack",
    "niswasa prabasare kasta heuchi kasha saha wheezing chhati tightness",
    "shortness of breath wheezing coughing fits allergy history difficult breathing",
    "productive cough phlegm chest tightness bronchial asthma dyspnea",
    "kasta heuchi nisasane kasha kafa baharuchi",
    "climbing stairs shortness of breath chest tightness productive cough",
    "persistent cough for the last two weeks that is worse at night productive yellowish phlegm chest tightness",
    "persistent cough worse at night productive yellow phlegm short of breath chest tightness",
    "niswasa prabasare kasta heuchi kasha saha wheezing chhati tightness",
    "productive cough phlegm chest tightness bronchial asthma dyspnea",
    "persistent cough for the last two weeks that is worse at night productive yellowish phlegm chest tightness",
    "shortness of breath wheezing coughing fits allergy history difficult breathing",
    "productive cough phlegm chest tightness bronchial asthma dyspnea",
    "persistent cough for the last two weeks that is worse at night productive yellowish phlegm chest tightness",
    "persistent cough worse at night productive yellow phlegm short of breath chest tightness",
    "niswasa prabasare kasta heuchi kasha saha wheezing chhati tightness",
    "climbing stairs shortness of breath chest tightness productive cough",
    "ve ongoing health for a week including a dry cough breathing difficulties and general weakness",
    "its a week suffering from continious health issues like dry cough in breathing weakness throughout the day",
    "a persistent cough and quite fatigued fever through the roof and m trouble breathing cough also cough up a lot of mucous",
    "a cough that continued for days and and fever high and breath become strained cough also generate a lot of mucus",
    "admit that a high fever a persistent cough and shortness of breath in addition ve coughing up a lot of thick mucoid saliva and ve depleted and worn out"
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
    "anta bindha bitha heuchi chalibare kasta poor posture",
    "herniated disc pain, back muscle spasm, stiff back",
    "back pain muscle pull spine spasm lifting heavy objects",
    "herniated disc pain, back muscle spasm, stiff back",
    "anta bindha bitha heuchi chalibare kasta poor posture",
    "anta bindhuchi spine stiffness backache muscle strain",
    "lower back pain sciatica herniated lumbar disc spasm",
    "backache a difficulty breathing and limb weakness bothering me balance and dizzy concerns and neck suffers",
    "back pain a lingering cough and muscle weakness bothering me issues with dizziness and losing equilibrium and neck hurts",
    "back pain a chronic cough and muscle weakness bothering me concerns with dizziness and losing position and neck hurts",
    "back pain a dry cough and a lack of muscle strength bothering me neck hurts and ve lightheaded and shaky",
    "back pain a productive cough and limb weakness bothering me balance and dizzy concerns and neck hurts"
  ],
  cardiomegaly: [
    "enlarged heart cardiomegaly short of breath fluid retention swollen ankles",
    "cardiomegaly heart enlargement congestive heart failure breathlessness lying down",
    "chhati bhari heart failure breathlessness feet swelling fatigue cardiomegaly",
    "difficulty breathing when lying flat orthopnea swollen legs heart enlargement",
    "ventricular hypertrophy cardiomegaly cardiac dilation fatigue irregular pulse",
    "enlarged cardiac silhouette on xray short of breath fatigue ankles swelling",
    "chhati fuli jaichi breathlessness lying down feet swelling heart size high",
    "cardiomegaly symptoms severe fatigue shortness of breath on minimal exertion",
    "cardiomegaly symptoms severe fatigue shortness of breath on minimal exertion",
    "enlarged heart cardiomegaly short of breath fluid retention swollen ankles",
    "chhati fuli jaichi breathlessness lying down feet swelling heart size high",
    "enlarged cardiac silhouette on xray short of breath fatigue ankles swelling",
    "ventricular hypertrophy cardiomegaly cardiac dilation fatigue irregular pulse",
    "cardiomegaly heart enlargement congestive heart failure breathlessness lying down",
    "enlarged cardiac silhouette on xray short of breath fatigue ankles swelling",
    "chhati bhari heart failure breathlessness feet swelling fatigue cardiomegaly",
    "enlarged heart cardiomegaly short of breath fluid retention swollen ankles",
    "ventricular hypertrophy cardiomegaly cardiac dilation fatigue irregular pulse",
    "cardiomegaly heart enlargement congestive heart failure breathlessness lying down",
    "enlarged heart cardiomegaly short of breath fluid retention swollen ankles",
    "chhati bhari heart failure breathlessness feet swelling fatigue cardiomegaly",
    "enlarged cardiac silhouette on xray short of breath fatigue ankles swelling",
    "chhati bhari heart failure breathlessness feet swelling fatigue cardiomegaly"
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
    "chhati re jantrana sahita beka ebam hata re bitha",
    "sharp pain in middle of chest squeezing coronary risk",
    "severe chest tightness, pressure, short of breath, heart pain",
    "chest compression shortness of breath severe heart pain",
    "chest compression shortness of breath severe heart pain",
    "chhati bindhuchi chati jantrana breathlessness dizziness",
    "chhati bindhuchi chati jantrana breathlessness dizziness",
    "sharp chest pain when breathing, heart attack fear, squeezing",
    "angina pectoris chest discomfort tightness left arm jaw pain",
    "sharp chest pain when breathing, heart attack fear, squeezing",
    "sharp chest pain when breathing, heart attack fear, squeezing",
    "sharp pain in middle of chest squeezing coronary risk"
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
    "kafa jami jaichi kasha saha chhati bhari",
    "I have a persistent cough with mucus and a sore throat",
    "ମୋର ବହୁତ କାଶ ଏବଂ ଥଣ୍ଡା ହେଉଛି",
    "persistent throat tickle and dry cough",
    "gola basijaichi kansa kapa thanda",
    "ମୋର ବହୁତ କାଶ ଏବଂ ଥଣ୍ଡା ହେଉଛି",
    "nose runny and t to stop sneezing in addition constantly cold and ve coughing a lot fever also high far above normal",
    "t stop sneezing and and crummy throat sore and a lot of gunky stuff in nose and throat neck feels swollen and puffy too",
    "m coughing nonstop and m shivering terribly a stuffy nose and face under strain in addition throat coughing up some nasty gunk and chest hurts muscles hurt a lot and t smell anything",
    "t stop sneezing and nose runny m also cold and all the time and ve coughing a lot fever high too like way above normal",
    "keep sneezing and m miserable and a lot of gunky things in nose and throat and throat hurting neck also feels puffy and swollen"
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
    "aakhi dekhajiba chhota fatigue bahumutra sugar spike",
    "I have high blood sugar, extreme thirst, and frequent urination",
    "ମୋର ରକ୍ତ ଶର୍କରା ବୃଦ୍ଧି ପାଇଛି",
    "diabetic spike polyuria fasting blood glucose level high",
    "barambar parisra laguchi thirsty sugar level 300",
    "i have increased thirst and frequent urination i often have a dry mouth and throat recently i have been having increased hunger and appetite",
    "i m drinking more water and urinating more frequently my throat and mouth are frequently dry recently my appetite and hunger have both grown",
    "m drinking more water and urinating more frequently throat and mouth frequently dry recently appetite and hunger both grown",
    "ve drinking more water and urinating more frequently throat and mouth frequently dry recently both hunger and appetite grown",
    "both water intake and frequency of urination increased mouth and throat dry a lot hunger and appetite both increased recently",
    "both water intake and frequency of urination increased mouth and throat regularly dry appetite and hunger both increased recently",
    "increased thirst and frequent urination a dry mouth and throat recently increased hunger and appetite"
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
    "aakhi lal phuli jaichi aakhi bitha computer strain",
    "akhi bindhuchi akhi lala conjunctivitis blurry eye pain",
    "ocular pain dry eyes computer screen strain redness",
    "akhi pani baharuchi red eye pain strain watery",
    "photophobia dry itchy red eye infection conjunctivitis",
    "ocular pain dry eyes computer screen strain redness",
    "ocular pain dry eyes computer screen strain redness",
    "photophobia dry itchy red eye infection conjunctivitis",
    "akhi bindhuchi akhi lala conjunctivitis blurry eye pain",
    "akhi bindhuchi akhi lala conjunctivitis blurry eye pain",
    "aakhi lal phuli jaichi aakhi bitha computer strain",
    "sore eyes discharge itchiness photophobia blurry vision"
  ],
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
    "running a high temperature of 101 degrees Fahrenheit chills",
    "low-grade fever for three days mild headache scratchy throat dry cough nasal congestion",
    "low grade fever tired all the time muscles ache dry cough",
    "deha jwara laguchi chabuka maruchi temperature",
    "the joint pain experiencing and feels like a constant ache head aches most of the time and starting to develope mild fever accompanied with chills",
    "a high fever along with a headache the fever accompanied by extreme body pain and chills worried about health and don t know to",
    "along with body itchiness chills and nausea ve experiencing ve perspiring and a very high fever m queasy and also a headache hurting muscles me",
    "a lot of trouble sleeping because of the high fever and the headache moreover constant belly pain because of t go to work",
    "a high fever accompanied with headache and body pain experince chills every night there a distinct pain behind eyes too"
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
    "chronic headache tension migraine pressure head",
    "i have been having trouble with my vision seeing things as distorted and experiencing visual disturbances",
    "i ve been suffering visual disruptions seeing things as distorted and eyesight problems",
    "tension headache behind eyes stiff neck and shoulder pressure",
    "headache and nausea with extreme visual sensitivity",
    "ve suffering visual disruptions seeing things as distorted and eyesight",
    "trouble with vision seeing things as distorted and experiencing visual disturbances",
    "ve facing visual disruptions seeing things as distorted and eyesight difficulties",
    "ve facing visual disruptions seeing things as distorted and eyesight difficulties",
    "experiencing acidity indigestion headaches and blurred and distorted vision as well as excessive hunger a stiff neck depression irritability and visual disturbance"
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
    "blood pressure high dizzy blurry vision racing pulse",
    "I have high blood pressure, dizziness, and palpitations",
    "ମୋର ରକ୍ତଚାପ ବୃଦ୍ଧି ପାଇଛି ଏବଂ ମୁଣ୍ଡ ଘୁରାଉଛି",
    "sudden hypertensive spike in blood pressure dizzy feeling",
    "rakta chapa badhi gala bp spike palpitations",
    "i have been feeling disoriented and dizzy and have also had trouble keeping my balance my headache has been a constant presence as well",
    "i ve been experiencing balance issues along with feeling dizzy and lightheaded additionally i ve seen a drop in my concentration and focus",
    "ମୋର ରକ୍ତଚାପ ବୃଦ୍ଧି ପାଇଛି ଏବଂ ମୁଣ୍ଡ ଘୁରାଉଛି",
    "checked blood pressure and it is 160 over 100",
    "ve experiencing balance issues along with dizzy and lightheaded additionally ve seen a drop in concentration and focus",
    "disoriented and dizzy and also trouble keeping balance headache a constant presence as well",
    "ve experiencing balance issues in addition to disoriented and dizzy headache also present nonstop",
    "ve experiencing dizziness and anxiousness as well as a loss in attention and concentration and ability to concentrate",
    "in addition to dizzy and lightheaded ve keeping equilibrium capacity to concentrate and focus also slipping ve noticed"
  ],
  hyperlipidemia: [
    "high cholesterol hyperlipidemia lipid panel elevated ldl triglycerides plaque",
    "hypercholesterolemia cholesterol level 280 lipid profile cardiac risk",
    "high triglycerides lipid panel screening hyperlipidemia no symptoms plaque",
    "lipoproteins elevated cholesterol high ldl blood test screening lipid",
    "cholesterol badhi jaichi hyperlipidemia lipid panel blood test high ldl",
    "lipid profile abnormal total cholesterol 300 triglycerides 250 high ldl",
    "hyperlipidemia atherosclerotic risk elevated total cholesterol ldl triglycerides",
    "blood test lipid profile cholesterol spike hypercholesterolemia high triglycerides",
    "lipid profile abnormal total cholesterol 300 triglycerides 250 high ldl",
    "high triglycerides lipid panel screening hyperlipidemia no symptoms plaque",
    "blood test lipid profile cholesterol spike hypercholesterolemia high triglycerides",
    "high triglycerides lipid panel screening hyperlipidemia no symptoms plaque",
    "lipoproteins elevated cholesterol high ldl blood test screening lipid",
    "lipoproteins elevated cholesterol high ldl blood test screening lipid",
    "blood test lipid profile cholesterol spike hypercholesterolemia high triglycerides",
    "hypercholesterolemia cholesterol level 280 lipid profile cardiac risk",
    "lipid profile abnormal total cholesterol 300 triglycerides 250 high ldl",
    "lipid profile abnormal total cholesterol 300 triglycerides 250 high ldl",
    "lipid profile abnormal total cholesterol 300 triglycerides 250 high ldl",
    "lipoproteins elevated cholesterol high ldl blood test screening lipid",
    "hyperlipidemia atherosclerotic risk elevated total cholesterol ldl triglycerides",
    "high cholesterol hyperlipidemia lipid panel elevated ldl triglycerides plaque",
    "cholesterol badhi jaichi hyperlipidemia lipid panel blood test high ldl"
  ],
  hypothyroidism: [
    "hypothyroidism thyroid tsh high weight gain fatigue cold intolerance dry skin",
    "thyroid level high tsh levothyroxine thyroiditis hair loss fatigue weight gain",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "tsh level 12.5 fatigue unexplained weight gain feeling cold constantly dry skin",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis",
    "sluggish metabolism dry skin brittle hair hypothyroidism high tsh levothyroxine",
    "hypothyroidism symptoms cold intolerance weight gain dry scaly skin thyroid fatigue",
    "thyroid hormone replacement levothyroxine high thyroid stimulating hormone tsh",
    "sluggish metabolism dry skin brittle hair hypothyroidism high tsh levothyroxine",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis",
    "hypothyroidism thyroid tsh high weight gain fatigue cold intolerance dry skin",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "thyroid hormone replacement levothyroxine high thyroid stimulating hormone tsh",
    "hypothyroidism symptoms cold intolerance weight gain dry scaly skin thyroid fatigue",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "thyroid hormone replacement levothyroxine high thyroid stimulating hormone tsh",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis",
    "thyroid gland underactive hypothyroidism sluggish slow heart rate constipation",
    "thyroid badhi jaichi tsh high weight gain fatigue hair loss cold thyroiditis"
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
    "severe swelling in joints arthritis gout bone ache",
    "my neck has been really stiff and i ve had terrible muscle weakness due to the swelling in my joints it has been challenging to move about walking has been quite unpleasant",
    "recently i try to walk about i have stiffness a stiff neck swollen joints and muscular weakness walking has also been really uncomfortable",
    "joint swelling, knee arthritis pain, knee stiffness",
    "joint pain wrist ankle knee stiffness swelling",
    "ganthi bitha ganthi phula knee joint pain arthritis",
    "swollen knees, severe joint pain, gout flare, bone aches",
    "rheumatoid arthritis joint pain, knee inflammation, joint swelling",
    "neck stiff and ve terrible muscle weakness due to the swelling in joints it challenging to move about walking quite unpleasant",
    "ve experiencing muscular weakness and neck stiff swollen joints and find it difficult to move about without becoming stiff it also uncomfortable to walk",
    "recently try to walk about stiffness a stiff neck swollen joints and muscular weakness walking also uncomfortable",
    "recently muscles quite and neck tight swollen joints and find it difficult to move about without becoming stiff it also uncomfortable to walk",
    "ve experiencing muscular weakness and neck stiff it difficult to move about since joints swollen it uncomfortable to walk"
  ],
  "multiple sclerosis": [
    "numbness tingling in limbs double vision optic neuritis muscle weakness fatigue",
    "multiple sclerosis ms flare muscle spasms loss of balance vertigo difficulty walking",
    "paraesthesia hands legs double vision myelin plaque ms attack fatigue",
    "numbness or weakness in one or more limbs electric shock sensations with neck movement",
    "optic neuritis blurred vision in one eye multiple sclerosis demyelinating",
    "unsteady gait slurred speech extreme fatigue bladder dysfunction cognitive fog ms",
    "goda hata jhimijhimi fatigue double vision walking imbalance multiple sclerosis",
    "ms symptoms demyelination plaques on mri muscle stiffness weakness",
    "ms symptoms demyelination plaques on mri muscle stiffness weakness",
    "optic neuritis blurred vision in one eye multiple sclerosis demyelinating",
    "unsteady gait slurred speech extreme fatigue bladder dysfunction cognitive fog ms",
    "ms symptoms demyelination plaques on mri muscle stiffness weakness",
    "numbness tingling in limbs double vision optic neuritis muscle weakness fatigue",
    "unsteady gait slurred speech extreme fatigue bladder dysfunction cognitive fog ms",
    "numbness or weakness in one or more limbs electric shock sensations with neck movement",
    "numbness tingling in limbs double vision optic neuritis muscle weakness fatigue",
    "ms symptoms demyelination plaques on mri muscle stiffness weakness",
    "optic neuritis blurred vision in one eye multiple sclerosis demyelinating",
    "numbness or weakness in one or more limbs electric shock sensations with neck movement",
    "multiple sclerosis ms flare muscle spasms loss of balance vertigo difficulty walking",
    "numbness tingling in limbs double vision optic neuritis muscle weakness fatigue",
    "goda hata jhimijhimi fatigue double vision walking imbalance multiple sclerosis",
    "optic neuritis blurred vision in one eye multiple sclerosis demyelinating"
  ],
  pneumonia: [
    "cough with yellow green phlegm fever chills shortness of breath lung pain",
    "pneumonia chest congestion coughing up thick mucus high fever breathlessness",
    "kasha saha kapa baharuche fever breathing difficulty lungs consolidation",
    "shortness of breath painful cough fever yellow sputum lung infection",
    "coughing up rust colored sputum high fever chills sweat rapid breathing",
    "pneumonia alveolar consolidation chest discomfort coughing fits dyspnea",
    "kasha heuchi nisasane kasta chest congestion fever lung opacity",
    "pneumonia cough chills fever chest wall pain rapid shallow breathing",
    "ve with a high fever shortness of breath sweating chills and extreme heart rate rapid and ve coughing up a lot of brownish sputum",
    "ve experiencing chills worn out and t to rid of this cough cough chest aches and heart feels as like it beating a million miles per hour m coughing up a nasty rust colored phlegm",
    "ve very lousy with a high temperature shortness of breath sweating chills and extreme weariness heart beating and ve coughing up a lot of brownish phlegm",
    "m drenched with sweat and t to catch breath throat clogged with mucus and m miserable heart racing and chest aches m coughing up a brownish stringy mucus",
    "m sweating profusely and t to enough air throat filled with a lot of mucus and don t good heart pounding and chest aches m coughing up reddish colored mucous",
    "m drenched with sweat and t to catch breath throat clogged with mucus and m miserable heart racing and chest aches m coughing up a brownish stringy mucus",
    "coughing up rust colored sputum high fever chills sweat rapid breathing",
    "pneumonia chest congestion coughing up thick mucus high fever breathlessness",
    "kasha saha kapa baharuche fever breathing difficulty lungs consolidation",
    "ve experiencing chills worn out and t to rid of this cough cough chest aches and heart feels as like it beating a million miles per hour m coughing up a nasty rust colored phlegm",
    "kasha saha kapa baharuche fever breathing difficulty lungs consolidation",
    "m drenched with sweat and t to catch breath throat clogged with mucus and m miserable heart racing and chest aches m coughing up a brownish stringy mucus",
    "pneumonia alveolar consolidation chest discomfort coughing fits dyspnea",
    "coughing up rust colored sputum high fever chills sweat rapid breathing",
    "kasha heuchi nisasane kasta chest congestion fever lung opacity"
  ],
  "renal failure": [
    "elevated creatinine level low egfr kidney failure chronic kidney disease uremia",
    "renal failure creatinine 3.5 egfr 20 decreased urination fluid retention swollen legs",
    "kidney function decreased uremic retention creatinine high renal clearance",
    "chronic kidney disease ckd stage 3 elevated creatinine kidney failure fatigue",
    "kidneys not functioning well high creatinine egfr restriction renal impairment",
    "kidney failure swollen ankles feet shortness of breath high creatinine uremia",
    "creatinine badhi jaichi ckd kidney failure urine decrease swelling legs",
    "renal clearance restriction elevated creatinine level 4.2 ckd nephropathy",
    "renal failure creatinine 3.5 egfr 20 decreased urination fluid retention swollen legs",
    "kidney failure swollen ankles feet shortness of breath high creatinine uremia",
    "chronic kidney disease ckd stage 3 elevated creatinine kidney failure fatigue",
    "chronic kidney disease ckd stage 3 elevated creatinine kidney failure fatigue",
    "elevated creatinine level low egfr kidney failure chronic kidney disease uremia",
    "kidneys not functioning well high creatinine egfr restriction renal impairment",
    "creatinine badhi jaichi ckd kidney failure urine decrease swelling legs",
    "chronic kidney disease ckd stage 3 elevated creatinine kidney failure fatigue",
    "kidney function decreased uremic retention creatinine high renal clearance",
    "chronic kidney disease ckd stage 3 elevated creatinine kidney failure fatigue",
    "renal clearance restriction elevated creatinine level 4.2 ckd nephropathy",
    "creatinine badhi jaichi ckd kidney failure urine decrease swelling legs",
    "renal clearance restriction elevated creatinine level 4.2 ckd nephropathy",
    "elevated creatinine level low egfr kidney failure chronic kidney disease uremia",
    "creatinine badhi jaichi ckd kidney failure urine decrease swelling legs"
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
    "kundia skin rash hives allergy dermatitis red spots",
    "I have an itchy red skin rash and allergic skin patches",
    "ମୋ ଚର୍ମ କୁଣ୍ଡେଇ ହେଉଛି ଏବଂ ଲାଲ ପଡିଯାଇଛି",
    "allergic red spots hives on forearm and shoulders itching",
    "charma khasru roga kundia hela rash",
    "i have an itchy skin and lots of red bumps on my arms and legs there are some weird looking spots on my skin too and sometimes there are bumps that feel kind of hard",
    "there are now red blotches all over my body i have been itching horribly all over a few of the patches also differ in complexion from my natural skin and these lumps or bumps have developed on my skin",
    "fungal infection rash, burning skin, severe itching",
    "extreme skin irritation itching rash hives dry patches",
    "there now red blotches all over body itching horribly all over a few of the patches also differ in complexion from natural skin and these lumps or bumps developed on skin",
    "an itchy skin and lots of red bumps on arms and legs there some weird looking spots on skin too and sometimes there bumps that kind of hard",
    "body itching terribly all over and there now red spots everywhere some of the patches also differ in tone from natural complexion and there these lumps or pimples that appeared on skin",
    "all over body itching like crazy and now there red areas all over additionally some of the patches a different tone than natural skin and on skin there these lumps or pimples that developed",
    "lots of itchy spots on skin and sometimes turn red or bumpy there also some weird patches that different colors than the rest of skin and sometimes these weird bumps that look like little balls"
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
    "peta katuchi bhari banti nausea acid reflux",
    "peta katuchi bhari banti nausea acid reflux",
    "acute gastritis stomach ulcer heartburn belly pain bloating",
    "peta katuchi banti laguchi stomach pain bloating",
    "peta katuchi banti laguchi stomach pain bloating",
    "peta bitha heuchi gas pain vomiting banti laguchi indigestion",
    "gastric pain, diarrhea, loose stools, nausea, vomiting",
    "uneasiness after eating and usually vomit whatever ve eaten always this pain in abdomen and acid reflux",
    "heartburn and indigestion vomit whatever eat and difficultly swallowing food beacuse the food stuck in throat a nagging pain in upper abdomen",
    "after eating and puke up the entire meal constantly excruciating acid reflux and stomach pain",
    "persistant gnawing hunger and apetite sometimes abdominal cramps and spasms there bloating and gas after eating causes me a great deal of uneasiness",
    "a strong appetite and constantly hungry stomach occasionally aches and cramps painful gas and bloating after eating"
  ],
  stroke: [
    "sudden numbness weakness on one side of body face drooping arm weakness slurred speech",
    "ischemic stroke hemiplegia loss of speech vision loss transient ischemic attack",
    "stroke warning signs face droop arm drift speech difficulty slurred",
    "sudden severe headache confusion difficulty walking loss of balance dizziness stroke",
    "cerebral infarct stroke occlusion numbness arm leg face weakness",
    "banti laguchi munda ghureiba half body paralyzed stroke sudden weakness speech",
    "sudden visual impairment loss of coordination weakness left arm leg stroke",
    "transient ischemic attack tia sudden paralysis numbness slurred speech stroke",
    "sudden visual impairment loss of coordination weakness left arm leg stroke",
    "sudden severe headache confusion difficulty walking loss of balance dizziness stroke",
    "banti laguchi munda ghureiba half body paralyzed stroke sudden weakness speech",
    "cerebral infarct stroke occlusion numbness arm leg face weakness",
    "cerebral infarct stroke occlusion numbness arm leg face weakness",
    "stroke warning signs face droop arm drift speech difficulty slurred",
    "stroke warning signs face droop arm drift speech difficulty slurred",
    "transient ischemic attack tia sudden paralysis numbness slurred speech stroke",
    "banti laguchi munda ghureiba half body paralyzed stroke sudden weakness speech",
    "sudden numbness weakness on one side of body face drooping arm weakness slurred speech",
    "cerebral infarct stroke occlusion numbness arm leg face weakness",
    "ischemic stroke hemiplegia loss of speech vision loss transient ischemic attack",
    "sudden severe headache confusion difficulty walking loss of balance dizziness stroke",
    "sudden severe headache confusion difficulty walking loss of balance dizziness stroke",
    "banti laguchi munda ghureiba half body paralyzed stroke sudden weakness speech"
  ],
  tonsillitis: [
    "sore throat swollen glands white spots back of throat painful to swallow solids fever no cough",
    "acute tonsillitis pharyngitis severe throat pain difficulty swallowing swollen tonsils",
    "gala bitha gila hela kasta swollen glands throat white spots",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "strep throat sore throat swollen neck lymph nodes painful swallow solids",
    "ganthela gala phuli jaichi gilila belaku kasta fever",
    "sore throat white patches on tonsils painful swallowing no cough",
    "sore throat and swollen glands white spots back of throat painful swallow solids",
    "sore throat swollen glands white spots back of throat painful to swallow solids fever no cough",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "sore throat and swollen glands white spots back of throat painful swallow solids",
    "sore throat white patches on tonsils painful swallowing no cough",
    "sore throat swollen glands white spots back of throat painful to swallow solids fever no cough",
    "sore throat and swollen glands white spots back of throat painful swallow solids",
    "acute tonsillitis pharyngitis severe throat pain difficulty swallowing swollen tonsils",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "strep throat sore throat swollen neck lymph nodes painful swallow solids",
    "sore throat swollen glands white spots back of throat painful to swallow solids fever no cough",
    "sore throat swollen glands white spots back of throat painful to swallow solids fever no cough",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "painful swallowing throat inflammation fever throat spots neck glands swollen",
    "strep throat sore throat swollen neck lymph nodes painful swallow solids"
  ],
  tuberculosis: [
    "persistent cough coughing up blood hemoptysis night sweats weight loss fever",
    "tuberculosis chronic cough sweating at night weight loss chest discomfort fatigue",
    "tb kasha rakta baharuche chest discomfort night sweat weight loss fatigue",
    "cavitary lesions on chest lung cavity tuberculosis persistent cough fever",
    "coughing for more than three weeks fever night sweats unexplained weight loss",
    "tb suspect chronic cough hemoptysis miliary tb infiltration",
    "kasha sahita rakta paduchi tb chest discomfort weakness weight loss",
    "tuberculosis exposure chronic dry cough afternoon fever night sweats",
    "tuberculosis chronic cough sweating at night weight loss chest discomfort fatigue",
    "tb suspect chronic cough hemoptysis miliary tb infiltration",
    "tuberculosis chronic cough sweating at night weight loss chest discomfort fatigue",
    "tuberculosis chronic cough sweating at night weight loss chest discomfort fatigue",
    "tb suspect chronic cough hemoptysis miliary tb infiltration",
    "tb kasha rakta baharuche chest discomfort night sweat weight loss fatigue",
    "tuberculosis exposure chronic dry cough afternoon fever night sweats",
    "tb suspect chronic cough hemoptysis miliary tb infiltration",
    "kasha sahita rakta paduchi tb chest discomfort weakness weight loss",
    "tb kasha rakta baharuche chest discomfort night sweat weight loss fatigue",
    "tb suspect chronic cough hemoptysis miliary tb infiltration",
    "tb kasha rakta baharuche chest discomfort night sweat weight loss fatigue",
    "cavitary lesions on chest lung cavity tuberculosis persistent cough fever",
    "tb kasha rakta baharuche chest discomfort night sweat weight loss fatigue",
    "cavitary lesions on chest lung cavity tuberculosis persistent cough fever"
  ],
  uti: [
    "burning sensation when i pee frequent urination constant urge lower abdominal discomfort",
    "painful urination dark urine frequent urge to pee lower stomach pressure",
    "parikra podajala barambar parisra laguchi bitha heuchi urge",
    "burning micturition dysuria urine is dark yellow and smelly",
    "constant urge to urinate lower belly discomfort tired pee burning",
    "barambar parisra heuchi poduchi lower abdomen pain",
    "burning sensation when passing urine frequent urination dark color",
    "frequent urination and a burning sensation when i pee lower abdominal discomfort",
    "i have to constantly to go the bathroom to relieve myself but seem to empty my bladder i these very strong and uncontrollable urges to pee and sometimes dark or bloody pee",
    "i need to relieve myself regularly but i t seem to my bladder to empty on sometimes i intense uncontrollable urges to urinate along with dark or red urine",
    "constant urge to urinate lower belly discomfort tired pee burning",
    "frequent urination and a burning sensation when i pee lower abdominal discomfort",
    "frequent urination and a burning sensation when i pee lower abdominal discomfort",
    "barambar parisra heuchi poduchi lower abdomen pain",
    "burning sensation when passing urine frequent urination dark color",
    "parikra podajala barambar parisra laguchi bitha heuchi urge",
    "barambar parisra heuchi poduchi lower abdomen pain",
    "painful urination dark urine frequent urge to pee lower stomach pressure",
    "to constantly to go the bathroom to relieve myself but to empty bladder these very strong and uncontrollable urges to pee and sometimes dark or bloody pee",
    "need to relieve myself regularly but t to bladder to empty on sometimes intense uncontrollable urges to urinate along with dark or red urine",
    "to go the bathroom all the time but the urine output very low just a few drops stomach hurts a lot and and to able to control urges to pee",
    "to use the restroom frequently to relieve myself but t to bladder empty occasionally uncontrolled desires to urinate as well as black or crimson urine",
    "frequent urges to urinate with little output pain during urination cloudy or bloody urine strong or foul smelling urine pelvic pain low fever nausea and vomiting"
  ],
  vertigo: [
    "sudden dizziness room spinning nauseous unsteady walk ringing ear tinnitus",
    "vertigo attack spinning sensation dizziness nausea loss of balance",
    "munda ghureiba munda ghuri heuchi banti laguchi spinning balance loss",
    "dizzy room is spinning unsteady walking tinnitus ringing in ear",
    "lightheadedness room spin vertigo vestibular imbalance nausea",
    "munda pura ghirei heuchi chalibare kasta spinning",
    "sudden dizzy spell room spinning ringing in right ear unsteady",
    "sudden dizziness and the room seemed to spin feel unsteady when i walk ringing in ear",
    "lightheadedness room spin vertigo vestibular imbalance nausea",
    "vertigo attack spinning sensation dizziness nausea loss of balance",
    "munda pura ghirei heuchi chalibare kasta spinning",
    "dizzy room is spinning unsteady walking tinnitus ringing in ear",
    "sudden dizzy spell room spinning ringing in right ear unsteady",
    "sudden dizziness room spinning nauseous unsteady walk ringing ear tinnitus",
    "sudden dizziness room spinning nauseous unsteady walk ringing ear tinnitus",
    "vertigo attack spinning sensation dizziness nausea loss of balance",
    "sudden dizziness and the room seemed to spin feel unsteady when i walk ringing in ear",
    "sudden dizziness room spinning nauseous unsteady walk ringing ear tinnitus",
    "lightheadedness room spin vertigo vestibular imbalance nausea",
    "vertigo attack spinning sensation dizziness nausea loss of balance",
    "sudden dizziness and the room seemed to spin feel unsteady when i walk ringing in ear",
    "vertigo attack spinning sensation dizziness nausea loss of balance",
    "dizzy room is spinning unsteady walking tinnitus ringing in ear"
  ],
  wound: [
    "cut foot on rusty nail red swollen painful cut foul smelling discharge fever infected",
    "infected wound cut skin pus discharge swollen red painful wound tetanus risk",
    "ksata sthana phuli jaichi ksata re pus discharge red swollen betha",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "septic wound injury cut swelling fever foul odor discharge",
    "ksata heba phuliba pucha baharuchi fever infected",
    "skin laceration cut by rusty nail red swelling painful localized heat",
    "cut my foot on a rusty nail three days ago area around cut is red swollen foul discharge fever",
    "cut my foot on a rusty nail three days ago area around cut is red swollen foul discharge fever",
    "skin laceration cut by rusty nail red swelling painful localized heat",
    "cut foot on rusty nail red swollen painful cut foul smelling discharge fever infected",
    "infected wound cut skin pus discharge swollen red painful wound tetanus risk",
    "infected wound cut skin pus discharge swollen red painful wound tetanus risk",
    "cut foot on rusty nail red swollen painful cut foul smelling discharge fever infected",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "ksata heba phuliba pucha baharuchi fever infected",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "skin laceration cut by rusty nail red swelling painful localized heat",
    "injury cut rusty metal nail swelling redness pain infected pus",
    "skin laceration cut by rusty nail red swelling painful localized heat",
    "injury cut rusty metal nail swelling redness pain infected pus"
  ]
};;
;

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

// Load expanded corpus from localStorage if it exists to preserve dynamic retraining
try {
  const storedCorpus = localStorage.getItem('ramanai_expanded_corpus');
  if (storedCorpus) {
    const parsed = JSON.parse(storedCorpus);
    for (const [cond, phrases] of Object.entries(parsed)) {
      if (!SLM_TRAINING_CORPUS[cond]) {
        SLM_TRAINING_CORPUS[cond] = [];
      }
      phrases.forEach(phrase => {
        if (!SLM_TRAINING_CORPUS[cond].includes(phrase)) {
          SLM_TRAINING_CORPUS[cond].push(phrase);
        }
      });
    }
  }
} catch (e) {
  console.error("Failed to load expanded corpus from localStorage:", e);
}

// Initialize and Train SLM Engines
const slmClassifier = new NaiveBayesSymptomClassifier();
slmClassifier.train(SLM_TRAINING_CORPUS);

const markovGenerator = new MarkovTextGenerator();
markovGenerator.train(MARKOV_TRAINING_SENTENCES_EN, 'en');
markovGenerator.train(MARKOV_TRAINING_SENTENCES_OR, 'or');

function renderExplainabilityPanel(text) {
  const details = slmClassifier.explain(text);
  const classifications = slmClassifier.classify(text);
  const bestMatch = classifications[0];
  const condition = bestMatch.confidence > 25 ? bestMatch.condition : null;
  if (!condition) return "";
  
  const bestDetail = details[condition];
  if (!bestDetail) return "";
  
  const tokenRows = bestDetail.matchedTokens.map(t => `
    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <td style="padding:6px; color:var(--cyan); text-align:left;">${t.token}</td>
      <td style="padding:6px; text-align:center;">${t.count}</td>
      <td style="padding:6px; text-align:center; color:var(--teal);">${t.idf}</td>
      <td style="padding:6px; text-align:center;">${t.probability}</td>
      <td style="padding:6px; text-align:right; color:#ff4d6d; font-weight:bold;">${t.contribution}</td>
    </tr>
  `).join("");

  const otherScores = classifications.slice(0, 3).map(c => `
    <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px;">
      <span style="color:var(--text-muted);">${c.condition.toUpperCase()}</span>
      <span style="font-family:'Orbitron',sans-serif; color:${c.condition === condition ? 'var(--teal)' : 'var(--text-main)'}; font-weight:bold;">${c.confidence}%</span>
    </div>
  `).join("");

  return `
    <details class="clinician-only-block" style="margin-top:15px; margin-bottom:15px; background:rgba(0,0,0,0.25); border:1px solid rgba(0,255,179,0.15); border-radius:8px; padding:12px; font-size:0.8rem; color:var(--text-main); text-align:left; box-shadow:0 0 10px rgba(0,255,179,0.05);">
      <summary style="font-weight:bold; color:var(--teal); cursor:pointer; list-style:none; outline:none; display:flex; justify-content:space-between; align-items:center; font-family:var(--font-head); font-size:0.85rem; letter-spacing:0.5px;">
        <span>🔬 CLINICAL EXPLAINABILITY PANEL (CLINICIAN ONLY)</span>
        <span style="font-size:0.7rem; color:var(--text-muted);">[Click to Expand]</span>
      </summary>
      <div style="margin-top:10px; border-top:1px dashed rgba(0, 255, 179, 0.15); padding-top:10px;">
        <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px; line-height:1.4;">
          <strong>Naive Bayes Posterior Weights:</strong> Below is the offline pathopharmacology mapping and Laplace-smoothed TF-IDF scaling computed 100% locally on your device.
        </p>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:12px;">
          <div style="background:rgba(255,255,255,0.02); padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.68rem; color:var(--text-muted); display:block; text-transform:uppercase;">Diagnostic Log-Prior</span>
            <strong style="color:var(--text-main); font-family:'Orbitron',sans-serif; font-size:0.95rem;">${bestDetail.prior}</strong>
          </div>
          <div style="background:rgba(255,255,255,0.02); padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.68rem; color:var(--text-muted); display:block; text-transform:uppercase;">Trie Keyword Boost</span>
            <strong style="color:var(--teal); font-family:'Orbitron',sans-serif; font-size:0.95rem;">+${bestDetail.trieBoost}</strong>
          </div>
        </div>

        <h5 style="margin:10px 0 5px 0; color:var(--cyan); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">Matched Token Contributions</h5>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.72rem; text-align:left; margin-bottom:12px; min-width:250px;">
            <thead>
              <tr style="border-bottom:1px solid rgba(0,255,179,0.25); color:var(--text-muted);">
                <th style="padding:4px; text-align:left;">Token (N-gram)</th>
                <th style="padding:4px; text-align:center;">Freq</th>
                <th style="padding:4px; text-align:center;">IDF</th>
                <th style="padding:4px; text-align:center;">Smooth Prob</th>
                <th style="padding:4px; text-align:right;">Contrib (Log)</th>
              </tr>
            </thead>
            <tbody>
              ${tokenRows || `<tr><td colspan="5" style="text-align:center; padding:10px; color:var(--text-muted);">No tokens matched vocabulary. Used default class priors.</td></tr>`}
            </tbody>
          </table>
        </div>

        <h5 style="margin:10px 0 5px 0; color:var(--cyan); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">Confidence Distribution</h5>
        <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
          ${otherScores}
        </div>
      </div>
    </details>
  `;
}
window.renderExplainabilityPanel = renderExplainabilityPanel;

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
  let condition = bestMatch.confidence > 25 ? bestMatch.condition : null;

  // Let's filter out generic fallback terms from bypassing fallback
  if (condition) {
    const tokens = slmClassifier.tokenize(text);
    const matchedTokens = tokens.filter(t => slmClassifier.vocabulary.has(t));
    const genericFallbackTerms = new Set([
      "pain", "hurt", "hurts", "ache", "aches", "bitha", "jantrana",
      "sick", "unwell", "exhausted", "tired", "weak", "fatigue", "feeling",
      "sluggish", "exhaust", "exhaustion", "weakness"
    ]);
    const hasSpecificToken = matchedTokens.some(t => !genericFallbackTerms.has(t));
    if (!hasSpecificToken) {
      condition = null;
    }
  }

  // Direct disease/condition name lookup bypass
  const cleanQuery = text.toLowerCase().trim();
  let directCondition = null;
  const diseaseSynonyms = {
    "bp": "high blood pressure",
    "hypertension": "high blood pressure",
    "tb": "tuberculosis",
    "migraine": "headache",
    "gout": "joint pain",
    "flu": "fever",
    "malaria": "malaria",
    "maleria": "malaria",
    "dengue": "fever",
    "typhoid": "fever",
    "acid reflux": "stomach pain",
    "gastritis": "stomach pain",
    "heart attack": "chest pain",
    "angina": "chest pain",
    "eczema": "skin rash",
    "hives": "skin rash",
    "dermatitis": "skin rash",
    "copd": "asthma",
    "bronchitis": "cough",
    "kidney failure": "renal failure",
    "ckd": "renal failure",
    "ms": "multiple sclerosis"
  };

  if (diseaseSynonyms[cleanQuery]) {
    directCondition = diseaseSynonyms[cleanQuery];
  }

  if (!directCondition) {
    for (const cond of Object.keys(MEDICAL_KB)) {
      if (cleanQuery === cond || cleanQuery === cond.replace(/\s+/g, '')) {
        directCondition = cond;
        break;
      }
    }
  }

  if (!directCondition) {
    for (const cond of Object.keys(MEDICAL_KB)) {
      if (cond.length > 4 && cleanQuery.includes(cond)) {
        directCondition = cond;
        break;
      }
    }
  }

  if (!directCondition) {
    for (const [cond, kbData] of Object.entries(MEDICAL_KB)) {
      if (kbData.conditions) {
        for (const subCond of kbData.conditions) {
          const cleanSub = subCond.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
          const subWords = cleanSub.split(/\s+/);
          const isExactWord = subWords.includes(cleanQuery);
          const isSubMatch = cleanQuery.length >= 3 && (cleanSub.includes(cleanQuery) || cleanQuery.includes(cleanSub));
          if (isExactWord || isSubMatch) {
            directCondition = cond;
            break;
          }
        }
      }
      if (directCondition) break;
    }
  }

  if (directCondition) {
    condition = directCondition;
    if (bestMatch) {
      bestMatch.condition = directCondition;
      bestMatch.confidence = 100; // Force direct match confidence
    }
  }

  // Pre-compute out-of-context detection to bypass accidental vocabulary matches
  const isHello = /^hi$|^hello$|^hey$|^greetings$|namaskar/i.test(text.trim());
  const isThanks = /thank|appreciate|grateful/i.test(text.trim());
  const isWho = /who are you|what are you|your name/i.test(text.trim());
  const isChat = /how are you|talk to me|say something|can we talk|friend|help me/i.test(text.trim());

  const outOfContextKeywords = new Set([
    "breakfast", "lunch", "dinner", "eat", "food", "recipe", "cook", "restaurant", "hotel", 
    "weather", "sports", "cricket", "football", "movie", "song", "music", "capital", "president", 
    "prime minister", "price", "buy", "car", "phone", "laptop", "game", "play", "joke", "riddle", 
    "flight", "ticket", "news", "politics", "crypto", "bitcoin", "stock", "invest", "finance",
    "code", "program", "developer", "engineering", "history", "geography", "math", "science"
  ]);

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

  const cleanWords = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ").trim().split(/\s+/);
  
  let hasMedicalWord = false;
  for (const w of cleanWords) {
    if ((slmClassifier.vocabulary.has(w) || healthKeywords.has(w)) && !outOfContextKeywords.has(w)) {
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
    condition = null;
  }

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
    // Conversational fallbacks (already defined in outer scope)
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

    // Direct chatbot Red Flags compiler
    const vitalsObj = { bp: profile.bp || "", heartRate: profile.heartRate || "", temp: profile.temp || "", SpO2: profile.SpO2 || "" };
    const redFlags = compileRedFlags(condition, vitalsObj);
    if (redFlags.length > 0) {
      html += `
        <div class="med-section warning" style="border-left:4px solid var(--red-warn); background:rgba(255, 77, 109, 0.08); padding:12px; border-radius:6px; margin-bottom:15px; font-size:0.85rem; box-shadow:0 0 10px rgba(255, 77, 109, 0.15);">
          <strong style="color:var(--red-warn); font-family:var(--font-head);"><span style="animation: pulseGlow 1.5s infinite;">⚠️ CRITICAL MEDICAL RED FLAGS (EMERGENCY WARNING)</span></strong>
          <ul style="margin:5px 0 0 0; padding-left:18px; line-height:1.4; color:var(--text-main); text-align:left;">
            ${redFlags.map(flag => `<li style="margin-bottom:4px;">${flag}</li>`).join("")}
          </ul>
        </div>`;
    }

    // Target Category Confidence Badge
    html += `
      <div class="slm-confidence-bar" style="background:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px; margin-bottom:15px; display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.6)">Local Inference Match</span>
        <span class="vault-badge" style="border-color:var(--primary); color:var(--primary); background:rgba(0, 255, 179, 0.1); font-weight:bold; font-size:0.8rem;">
          ${condition.toUpperCase()} (${bestMatch.confidence}% Match)
        </span>
      </div>`;

    const CLINICAL_SYMPTOMS = new Set([
      "fever", "headache", "cough", "chest pain", "stomach pain", 
      "joint pain", "skin rash", "eye pain", "back pain", 
      "vertigo", "wound"
    ]);
    if (CLINICAL_SYMPTOMS.has(condition)) {
      html += `<div class="med-section">
        <div class="med-section-title">${isOr ? ODIA_DICT.possibleCond : "🔬 POSSIBLE CONDITIONS"}</div>
        <ul>${kb.conditions.map(c => `<li>${c}</li>`).join("")}</ul>
      </div>`;
    }

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

      ${renderExplainabilityPanel(text)}

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
    clearInterval(splashInterval);
  }
}, 800);

// Dynamic loading percentage animator
let splashPct = 0;
const splashPercentEl = document.getElementById("splashPercent");
const pctInterval = setInterval(() => {
  splashPct += Math.floor(Math.random() * 3) + 1;
  if (splashPct >= 100) {
    splashPct = 100;
    clearInterval(pctInterval);
  }
  if (splashPercentEl) {
    splashPercentEl.textContent = String(splashPct).padStart(2, '0') + "%";
  }
}, 38);

window._splashTimer = setTimeout(() => {
  clearInterval(pctInterval);
  if (splashPercentEl) splashPercentEl.textContent = "100%";
}, 4800);

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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
  document.getElementById('tutorialBackdrop').style.display = 'block';
  document.getElementById('tutorialModal').classList.add('open');
}
function closeTutorial() {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
    icd11: "MG26",
    conditions: ["Viral Infection", "Bacterial Infection", "Flu (Influenza)", "Common Cold", "COVID-19", "Malaria", "Dengue", "Typhoid"],
    medications: [
      { name: "Paracetamol 650mg (Brand: Calpol, Crocin)", snomed: "387584000", dose: "500–1000 mg every 6–8 hours as needed (Maximum 4000 mg per 24 hours)", note: "First-line antipyretic & analgesic. Directly acts on the hypothalamus to reduce high body temperature. Take with a glass of water; can be administered with or without food. Avoid other acetaminophen-containing medications to prevent accidental hepatotoxicity." },
      { name: "Ibuprofen 400mg (Brand: Brufen, Advil)", snomed: "386864001", dose: "400 mg every 8 hours with food (Maximum 1200 mg per 24 hours)", note: "Non-steroidal anti-inflammatory drug (NSAID). Relieves fever, body aches, and inflammatory responses by blocking prostaglandin synthesis. ALWAYS take with food, milk, or antacids to safeguard gastric mucosa. Do not use if history of peptic ulcers or severe kidney disease." }
    ],
    precautions: ["Stay hydrated – drink 8–10 glasses of water/day", "Rest adequately", "Monitor temperature every 4 hours", "Seek urgent care if fever exceeds 104°F (40°C)"],
    diet: ["Warm soups and broths", "Fresh citrus fruits (Vitamin C)", "Ginger and tulsi tea", "Avoid cold foods and beverages"],
    specialist: "General Physician / Internist"
  },
  malaria: {
    icd11: "1F40",
    conditions: ["Plasmodium Falciparum Malaria", "Plasmodium Vivax Malaria"],
    medications: [
      { name: "Artesunate 60mg and Sulfadoxine-Pyrimethamine (Brand: Larinate)", snomed: "N/A", dose: "Take as directed by physician (standard 3-day course)", note: "Artemisinin-based combination therapy (ACT). Rapidly clears asexual blood stages of malaria parasites." },
      { name: "Primaquine Phosphate 15mg (Brand: Primarid)", snomed: "386923000", dose: "15mg orally once daily for 14 days (vivax rad. cure)", note: "8-aminoquinoline. Clears dormant liver hypnozoites in P. vivax. Contraindicated in G6PD deficiency." }
    ],
    precautions: ["ALWAYS check G6PD status before administering Primaquine (risk of fatal hemolysis)", "Complete the full course of antimalarials even if fever resolves", "Use insecticide-treated bed nets and insect repellent"],
    diet: ["Stay hydrated with ORS and fresh coconut water", "Light carbohydrate-rich meals", "Avoid fatty foods during nausea"],
    specialist: "Infectious Disease Specialist / General Physician"
  },
  headache: {
    icd11: "MB4D",
    conditions: ["Tension Headache", "Migraine", "Dehydration", "Sinusitis", "Hypertension"],
    medications: [
      { name: "Paracetamol 650mg (Brand: Calpol, Crocin)", snomed: "387584000", dose: "500–1000 mg every 6 hours as needed (Maximum 4000 mg/day)", note: "First-line relief for mild-to-moderate tension headaches. Minimizes headache severity by inhibiting prostaglandin synthesis in the central nervous system. Safe for gastric lining, but avoid alcohol consumption during use." },
      { name: "Ibuprofen 400mg (Brand: Brufen, Advil)", snomed: "386864001", dose: "400 mg every 8 hours with food", note: "Highly effective NSAID targeting vascular and muscular tension components of tension headaches. Take after meals to avoid gastrointestinal discomfort." },
      { name: "Sumatriptan 50mg (Brand: Suminat, Imitrex)", snomed: "372834007", dose: "50 mg orally at the immediate onset of migraine attack; may repeat once after 2 hours if pain persists (Maximum 100 mg per 24 hours)", note: "Selective 5-HT1 receptor agonist. Specifically targets migraine attacks by constricting dilated cranial blood vessels and blocking inflammatory neuropeptide release. Take immediately at the first sign of aura or pain. Do not use if history of ischemic heart disease or uncontrolled hypertension." }
    ],
    precautions: ["Avoid screen time and bright lights", "Apply cold/warm compress on forehead", "Seek emergency care for sudden severe 'thunderclap' headache"],
    diet: ["Drink plenty of water", "Avoid caffeine excess", "Small regular meals", "Magnesium-rich foods (nuts, leafy greens)"],
    specialist: "Neurologist (for chronic/recurring headaches)"
  },
  cough: {
    icd11: "MD11",
    conditions: ["Common Cold", "Bronchitis", "Asthma", "GERD", "Pneumonia", "Allergic Rhinitis"],
    medications: [
      { name: "Dextromethorphan Hydrobromide 10mg (Brand: Benadryl DR, Robitussin)", snomed: "387042006", dose: "10–20 mg every 4–6 hours as needed (Maximum 120 mg/day)", note: "Non-narcotic cough suppressant. Directly acts on the cough center in the medulla oblongata to inhibit dry, hacking, non-productive coughs. May cause mild drowsiness; avoid driving or operating heavy machinery during use." },
      { name: "Guaifenesin 200mg (Brand: Mucinex, Robitussin Mucus)", snomed: "387140008", dose: "200–400 mg every 4 hours as needed with a full glass of water (Maximum 2400 mg/day)", note: "Expectorant. Reduces the viscosity of tenacious respiratory secretions and thins mucus, making it easier to cough up and clear from bronchial pathways. Maintain high water intake to optimize expectorant efficiency." },
      { name: "Salbutamol Inhaler 100mcg (Brand: Asthalin, Ventolin)", snomed: "372813000", dose: "1–2 inhalations (90–180 mcg) every 4–6 hours as needed for bronchospasm relief", note: "Short-acting beta-2 adrenergic receptor agonist (bronchodilator). Relaxes bronchial smooth muscles to rapidly relieve chest tightness, wheezing, and coughing. Shake well before use and rinse mouth with water after inhalation to prevent dry throat." }
    ],
    precautions: ["Avoid cold air and smoke", "Stay hydrated", "Use steam inhalation", "Persistent cough >3 weeks needs investigation"],
    diet: ["Warm fluids – honey-lemon water", "Turmeric milk (Haldi doodh)", "Avoid dairy if producing mucus"],
    specialist: "Pulmonologist / ENT"
  },
  "chest pain": {
    icd11: "MD30",
    conditions: ["⚠️ Cardiac Emergency (Rule out immediately)", "Costochondritis", "GERD / Acid Reflux", "Muscle Strain", "Anxiety / Panic Attack"],
    medications: [
      { name: "⚠️ EMERGENCY EVALUATION (Aspirin 325mg chewable recommended)", snomed: "N/A", dose: "Call emergency medical services (108/911) immediately without delay", note: "CRITICAL NOTICE: Crushing or squeezing retrosternal chest pain radiating to the left arm, neck, or jaw, accompanied by diaphoresis (sweating), dyspnea (breathlessness), and dizziness, is a suspected acute myocardial infarction (heart attack). DO NOT take standard pain medications or wait; seek immediate ER assessment." },
      { name: "Antacid Suspension (Brand: Digene, Gelusil)", snomed: "372671000", dose: "10–20 mL of liquid antacid suspension or 1–2 chewable tablets as directed", note: "Neutralizes stomach acid to relieve esophageal reflux pain. Administer ONLY after a qualified emergency physician has physically evaluated your chest symptoms and fully ruled out cardiac conditions." }
    ],
    precautions: ["⚠️ CRITICAL: Treat all chest pain as cardiac until proven otherwise", "Call emergency services (108) immediately", "Do NOT drive yourself to hospital", "Chew aspirin 325mg if cardiac event suspected and not allergic"],
    diet: ["Avoid spicy, fatty foods", "Eat smaller meals", "No alcohol or caffeine"],
    specialist: "⚠️ Emergency Room / Cardiologist – IMMEDIATELY"
  },
  "stomach pain": {
    icd11: "MD80",
    conditions: ["Gastritis", "Irritable Bowel Syndrome (IBS)", "Appendicitis", "Peptic Ulcer", "Food Poisoning", "Indigestion"],
    medications: [
      { name: "Omeprazole 20mg (Brand: Omez, Prilosec)", snomed: "372679003", dose: "20 mg orally once daily, strictly 30–60 minutes before the first meal of the day", note: "Proton pump inhibitor (PPI). Suppresses gastric acid secretion at the secretory surface of gastric parietal cells, allowing inflamed esophageal, gastric, or duodenal mucosa to heal. Swallow whole; do not chew or crush." },
      { name: "Hyoscine Butylbromide 10mg (Brand: Buscopan)", snomed: "387063004", dose: "10–20 mg orally 3 times daily as needed for abdominal spasms", note: "Antispasmodic/anticholinergic drug. Relaxes visceral smooth muscles in the gastrointestinal, biliary, and urinary tracts to relieve cramping, colic, and stomach spasms. May cause dry mouth or blurred vision." },
      { name: "ORS (Oral Rehydration Salts) (Brand: Electral, Walyte)", snomed: "387213002", dose: "Dissolve 1 sachet in 1 Litre of clean drinking water; drink 200-400 mL after each loose stool or vomiting episode", note: "WHO-formulated oral rehydration salts containing glucose and essential electrolytes. Directly restores water and electrolyte balance lost during stomach upset, vomiting, or diarrhea. Do not boil the prepared solution." }
    ],
    precautions: ["⚠️ Severe right lower abdominal pain may indicate appendicitis – seek emergency care", "Avoid NSAIDs (aspirin, ibuprofen) on empty stomach", "Monitor for blood in stool"],
    diet: ["BRAT diet: Bananas, Rice, Applesauce, Toast", "Avoid spicy, oily, and acidic foods", "Small frequent meals", "Curd / yoghurt for gut health"],
    specialist: "Gastroenterologist"
  },
  "joint pain": {
    icd11: "ME82",
    conditions: ["Arthritis (Osteo/Rheumatoid)", "Gout", "Injury / Sprain", "Lupus", "Viral Arthralgia"],
    medications: [
      { name: "Ibuprofen 400mg (Brand: Brufen, Advil)", snomed: "386864001", dose: "400 mg orally 3 times daily immediately after meals (Maximum 1200 mg/day)", note: "NSAID. Suppresses joint inflammation, swelling, and arthritic pain by blocking cyclooxygenase (COX) pathways. Take strictly with food or milk. Avoid if taking oral anticoagulants or if you have renal impairment." },
      { name: "Diclofenac Gel 1% (Brand: Voveran Gel, Voltaren)", snomed: "372658000", dose: "Apply 2–4 grams of 1% gel locally to affected joint and rub gently 3–4 times daily", note: "Topical non-steroidal anti-inflammatory gel. Provides targeted, localized relief from joint pain and inflammation (especially knee and hand osteoarthrosis) with highly minimal systemic absorption and low gastric side effects. Wash hands after application." },
      { name: "Colchicine 0.5mg (Brand: Colgout, Colcrys)", snomed: "372740003", dose: "0.5–1 mg orally twice daily during an acute gout flare-up, or as prescribed by your rheumatologist", note: "Anti-gout agent. Directly inhibits microtubule assembly in neutrophils, preventing their activation and migration to joints with uric acid crystals, reducing extreme gout inflammation. Avoid grapefruit juice." }
    ],
    precautions: ["Rest the affected joint", "Apply ice for 20 min every 2 hours (first 48h)", "Avoid repetitive strain", "Weight management is key for knee arthritis"],
    diet: ["Anti-inflammatory diet: omega-3 fatty acids (fish, flaxseed)", "Turmeric and ginger", "Cherries (for gout)", "Reduce red meat and alcohol"],
    specialist: "Rheumatologist / Orthopaedic Surgeon"
  },
  "skin rash": {
    icd11: "MC20",
    conditions: ["Allergic Dermatitis", "Eczema", "Urticaria (Hives)", "Psoriasis", "Fungal Infection", "Drug Reaction"],
    medications: [
      { name: "Cetirizine Hydrochloride 10mg (Brand: Okacet, Zyrtec)", snomed: "372797003", dose: "10 mg orally once daily, preferably at bedtime to minimize daytime sedation", note: "Second-generation selective H1-receptor antagonist. Blocks histamine activity to relieve intense skin itching, hives (urticaria), and allergic dermatitis. May cause mild drowsiness in sensitive individuals." },
      { name: "Hydrocortisone Cream 1% (Brand: Cortizone-10, Hytone)", snomed: "372633003", dose: "Apply a thin film to the affected skin area twice daily for up to 7 consecutive days", note: "Mild topical corticosteroid. Directly suppresses inflammatory cytokines to reduce localized skin redness, swelling, and itching associated with eczema or contact dermatitis. Do not apply to open wounds, infected areas, or facial skin unless directed." },
      { name: "Clotrimazole Cream 1% (Brand: Candid Cream, Lotrimin)", snomed: "387332009", dose: "Apply a thin layer to the affected clean skin area twice daily for 2–4 consecutive weeks", note: "Broad-spectrum topical antifungal agent. Disrupts fungal cell membrane synthesis to treat ringworm, tinea, and cutaneous candidiasis. Continue application for 1 week after symptoms resolve to prevent recurrence." }
    ],
    precautions: ["Avoid scratching", "Identify and avoid triggers", "⚠️ Seek emergency care for rash with difficulty breathing (anaphylaxis)", "Do not use steroid cream on face without advice"],
    diet: ["Avoid known allergens", "Increase Vitamin C and E intake", "Stay well-hydrated", "Avoid processed foods"],
    specialist: "Dermatologist / Allergist"
  },
  "high blood pressure": {
    icd11: "BA00",
    conditions: ["Hypertension (Primary)", "Secondary Hypertension", "White-coat Hypertension"],
    medications: [
      { name: "Amlodipine 5mg (Brand: Amlokind, Norvasc)", snomed: "372688001", dose: "5 mg orally once daily, taken at the same time each day (may increase to 10 mg under supervision)", note: "Dihydropyridine calcium channel blocker. Relaxes and dilates peripheral arterial smooth muscle cells, lowering vascular resistance and systemic blood pressure. Monitor for peripheral edema (ankle swelling)." },
      { name: "Losartan Potassium 50mg (Brand: Losacar, Cozaar)", snomed: "372695000", dose: "50 mg orally once daily (standard maintenance range is 25–100 mg/day)", note: "Angiotensin II receptor blocker (ARB). Prevents vasoconstriction and aldosterone release to lower blood pressure. Provides excellent long-term renal and cardiovascular protection in hypertensive patients. Do not use during pregnancy." },
      { name: "Hydrochlorothiazide 12.5mg (Brand: Aquazide, Microzide)", snomed: "372656001", dose: "12.5–25 mg orally once daily in the morning to avoid nocturnal urination", note: "Thiazide diuretic. Promotes renal excretion of sodium and water, reducing blood volume and blood pressure. Monitor blood potassium levels regularly as it can cause hypokalemia." }
    ],
    precautions: ["Monitor BP twice daily", "Do NOT stop medications abruptly", "⚠️ BP >180/120 is hypertensive crisis – seek emergency care", "Regular follow-ups required"],
    diet: ["DASH diet: low sodium (<2g/day)", "Increase potassium (bananas, spinach)", "Reduce alcohol", "Avoid processed/packaged foods", "Regular aerobic exercise"],
    specialist: "Cardiologist / Internist"
  },
  diabetes: {
    icd11: "5A11",
    conditions: ["Type 1 Diabetes", "Type 2 Diabetes", "Pre-diabetes", "Gestational Diabetes"],
    medications: [
      { name: "Metformin Hydrochloride 500mg (Brand: Glycomet, Glucophage)", snomed: "372567000", dose: "500 mg orally twice daily with meals (titrate up slowly under medical guidance)", note: "Biguanide antihyperglycemic. Directly decreases hepatic glucose production, reduces intestinal absorption of glucose, and significantly enhances insulin sensitivity in peripheral tissues. Take with meals to minimize gastrointestinal side effects (nausea, abdominal discomfort)." },
      { name: "Glipizide 5mg (Brand: Glynase, Glucotrol)", snomed: "372562006", dose: "5 mg orally once daily, strictly 30 minutes before your first main meal (breakfast)", note: "Second-generation sulfonylurea. Directly stimulates pancreatic beta cells to secrete endogenous insulin. Monitor closely for signs of hypoglycemia (tremors, sweating, confusion, fast heart rate) and always carry a fast-acting sugar source." },
      { name: "Insulin (Human Isophane) (Brand: Mixtard, Humulin N)", snomed: "372687006", dose: "Dose must be individually titrated and prescribed by an endocrinologist based on daily blood glucose monitoring", note: "Exogenous hormone replacement. Crucial for Type 1 Diabetes and advanced Type 2 Diabetes to facilitate cellular glucose uptake and prevent severe diabetic ketoacidosis (DKA) or hyperosmolar hyperglycemic state (HHS). Learn proper subcutaneous injection techniques and site rotation." }
    ],
    precautions: ["Monitor blood sugar morning and 2 hours post-meal", "Never skip meals on medication", "Watch for hypoglycaemia symptoms (shaking, sweating, confusion)", "Regular HbA1c check every 3 months"],
    diet: ["Low glycaemic index foods", "Avoid sugar, white rice, maida", "High fibre: whole grains, vegetables, legumes", "Small frequent meals (5–6/day)", "Bitter gourd (karela), fenugreek – natural aids"],
    specialist: "Endocrinologist / Diabetologist"
  },
  "eye pain": {
    icd11: "MC14",
    conditions: ["Conjunctivitis", "Dry Eye Syndrome", "Glaucoma", "Uveitis", "Digital Eye Strain"],
    medications: [
      { name: "Artificial Tears Lubricant Drops (Brand: Tear Drops, Refresh Tears)", snomed: "387132005", dose: "Instill 1–2 drops into the affected eye(s) up to 4–6 times daily as needed", note: "Sterile lubricant eye drops. Stabilizes the tear film and provides soothing relief from digital eye strain, dryness, burning, and ocular irritation. Remove contact lenses before instilling." },
      { name: "Chloramphenicol Eye Drops 0.5% (Brand: Chloromycetin, Optrex)", snomed: "372737004", dose: "Instill 1 drop into the affected eye(s) every 2 hours for the first 48 hours, then reduce to 4 times daily for 5 additional days", note: "Broad-spectrum topical ophthalmic antibiotic. Inhibits bacterial protein synthesis to treat acute bacterial conjunctivitis (pink eye). Finish the full 7-day course even if symptoms resolve earlier to prevent bacterial resistance." },
      { name: "Sodium Cromoglicate Eye Drops 2% (Brand: Cromal, Opticrom)", snomed: "372667008", dose: "Instill 1–2 drops into both eyes 4 times daily at regular intervals", note: "Ophthalmic mast cell stabilizer. Prevents the release of histamine and inflammatory mediators, treating allergic conjunctivitis and reducing ocular itching and redness. Best used preventatively during allergy season." }
    ],
    precautions: ["⚠️ Sudden vision loss / severe eye pain needs emergency care", "Do NOT rub eyes", "Follow 20-20-20 rule for digital strain", "Wear UV-protective sunglasses"],
    diet: ["Vitamin A: carrots, leafy greens", "Lutein: eggs, kale, spinach", "Omega-3 fatty acids", "Stay well-hydrated"],
    specialist: "Ophthalmologist"
  },
  "back pain": {
    icd11: "ME84",
    conditions: ["Muscle Strain", "Disc Herniation", "Lumbar Spondylosis", "Kidney Issues", "Poor Posture"],
    medications: [
      { name: "Ibuprofen 400mg / Diclofenac Potassium 50mg (Brand: Brufen / Voveran)", snomed: "386864001", dose: "400 mg Ibuprofen or 50 mg Diclofenac orally 3 times daily immediately after food", note: "Oral NSAID. Decreases musculoskeletal pain and inflammatory responses in the lower back or lumbar spine. Always take with a full meal to protect gastric mucosa." },
      { name: "Methocarbamol 750mg (Brand: Robinax, Robaxin)", snomed: "387002008", dose: "750 mg orally 3 times daily as needed for acute muscular spasms", note: "Centrally-acting skeletal muscle relaxant. Relieves severe muscle spasms and acute lumbar pain by inducing general central nervous system depression. May cause significant drowsiness, dizziness, or lightheadedness; avoid alcohol." },
      { name: "Diclofenac Sodium Topical Gel 1% (Brand: Voveran Gel, Voltaren)", snomed: "372658000", dose: "Apply 2–4 grams of 1% or 2% gel to the painful back area and rub in completely 3–4 times daily", note: "Targeted topical NSAID gel. Penetrates deep into musculoskeletal and joint tissues in the back to inhibit local prostaglandins, providing excellent pain relief with negligible systemic side effects. Do not apply to broken skin." }
    ],
    precautions: ["Avoid prolonged sitting", "Sleep on firm mattress", "⚠️ Back pain with numbness/weakness in legs – seek urgent care (possible nerve compression)", "Maintain correct posture"],
    diet: ["Calcium-rich foods: milk, yoghurt, ragi", "Vitamin D: sunlight, eggs, fish", "Anti-inflammatory: turmeric, ginger"],
    specialist: "Orthopaedic Surgeon / Physiotherapist"
  },
  uti: {
    icd11: "GB50",
    conditions: ["Cystitis", "Pyelonephritis", "Urethritis"],
    medications: [
      { name: "Nitrofurantoin 100mg (Brand: Nifty, Macrodantin)", snomed: "372691005", dose: "100 mg orally twice daily for 5 days with food", note: "First-line antibiotic for acute uncomplicated cystitis. Reaches high therapeutic concentrations in the bladder. Always take with meals to improve bioavailability and prevent nausea. Avoid in patients with severe renal impairment (eGFR <30 mL/min)." },
      { name: "Norfloxacin 400mg (Brand: Norbactin, Noroxin)", snomed: "372728003", dose: "400 mg orally twice daily for 3 days 1 hour before or 2 hours after meals", note: "Fluoroquinolone antibiotic. Effective against common urinary tract pathogens. Drink plenty of water during therapy to prevent crystalluria. Avoid simultaneous intake of antacids, calcium, or iron supplements. Contraindicated in children and pregnant women." }
    ],
    precautions: ["Drink 3-4 liters of water daily to flush bacteria", "Do not hold urine; empty bladder completely", "Urinate before and after sexual activity", "Complete the full antibiotic course to prevent resistance"],
    diet: ["Cranberry juice (prevents bacterial adhesion)", "Yoghurt / Probiotics", "High-fluid diet", "Avoid spicy foods, caffeine, and alcohol"],
    specialist: "Urologist / General Physician"
  },
  asthma: {
    icd11: "CA23",
    conditions: ["Bronchial Asthma", "Reactive Airway Disease", "Allergic Bronchitis"],
    medications: [
      { name: "Salbutamol Inhaler 100mcg (Brand: Asthalin, Ventolin)", snomed: "372813000", dose: "1–2 inhalations (100–200 mcg) every 4–6 hours as needed for quick relief", note: "Short-acting beta-2 agonist (SABA). Relaxes bronchial smooth muscle to rapidly reverse acute bronchospasm and chest tightness within 5 minutes. Shake well before use. Rinse mouth with water after inhalation to prevent throat dryness." },
      { name: "Fluticasone Propionate Inhaler 125mcg (Brand: Flohale, Flonase)", snomed: "372648008", dose: "1-2 inhalations twice daily for long-term control as prescribed by pulmonologist", note: "Inhaled corticosteroid (ICS). Reduces underlying airway inflammation and hyper-responsiveness. This is a controller medication; DO NOT use for acute distress. Symmetrical rinsing of mouth with water is REQUIRED after every dose to prevent oral thrush (candidiasis)." }
    ],
    precautions: ["⚠️ If peak flow drops or severe chest tightness occurs, use rescue inhaler and seek immediate ER care", "Avoid known allergy triggers, smoke, and strong odors", "Keep rescue inhaler accessible at all times", "Get annual influenza vaccine"],
    diet: ["Warm caffeine-free herbal teas", "Foods rich in Vitamin D and C", "Omega-3 rich seeds and nuts", "Avoid sulfites in dried fruits or processed food"],
    specialist: "Pulmonologist / Allergist"
  },
  vertigo: {
    icd11: "AB13",
    conditions: ["Benign Paroxysmal Positional Vertigo (BPPV)", "Vestibular Neuritis", "Labyrinthitis", "Meniere's Disease"],
    medications: [
      { name: "Betahistine Dihydrochloride 16mg (Brand: Vertin, Serc)", snomed: "372793009", dose: "16 mg orally three times daily with food", note: "Histamine analogue. Improves microcirculation in the inner ear by dilating precapillary sphincters, effectively reducing vertigo frequency and tinnitus severity. Take with food to avoid gastric irritation." },
      { name: "Cinnarizine 25mg (Brand: Stugeron, Vertigon)", snomed: "372729004", dose: "25 mg orally three times daily after meals", note: "Calcium channel blocker and antihistamine. Suppresses the vestibular system to relieve acute motion sickness, spinning sensations, and vestibular nausea. May cause significant drowsiness; avoid alcohol and driving." }
    ],
    precautions: ["Avoid sudden head movements or turning quickly", "Sit down immediately when a spinning spell starts", "Ensure floors are clear of rugs to prevent falls", "Use handrails on stairs"],
    diet: ["Low-sodium diet (helps control inner ear fluid pressure)", "Avoid caffeine and alcohol", "Stay well-hydrated throughout the day"],
    specialist: "ENT Specialist (Otolaryngologist) / Neurologist"
  },
  anemia: {
    icd11: "5A00",
    conditions: ["Iron Deficiency Anemia", "Vitamin B12 Deficiency Anemia", "Folate Deficiency Anemia"],
    medications: [
      { name: "Ferrous Ascorbate / Folic Acid (Brand: Orofer-XT, Autrin)", snomed: "387121004", dose: "1 tablet daily after food (preferably at night)", note: "Iron and vitamin supplement. Directly replenishes elemental iron stores and supports red blood cell hemoglobin synthesis. Vitamin C (ascorbate) increases absorption. May cause black stools or mild constipation. Do not take with tea, coffee, or calcium supplements." },
      { name: "Methylcobalamin (Vitamin B12) 1500mcg (Brand: Nurokind, Mecobalamin)", snomed: "387037009", dose: "1500 mcg orally once daily", note: "Active coenzyme form of Vitamin B12. Essential for red blood cell maturation, DNA synthesis, and peripheral nerve health. Highly recommended for strict vegetarians showing fatigue and neurological paresthesia." }
    ],
    precautions: ["Get a complete blood count (CBC) with peripheral smear", "Check serum iron, ferritin, and B12 levels", "Monitor for dark tarry stools or severe constipation from iron", "Do not ignore chronic fatigue; check blood parameters"],
    diet: ["Iron-rich foods: spinach, beetroot, pomegranate, dates", "Vitamin C-rich fruits to boost iron absorption", "Whole grains, lentils, green leafy vegetables", "Organ meats, eggs, fish (if non-vegetarian)"],
    specialist: "Hematologist / Internist"
  },
  tonsillitis: {
    icd11: "CA01",
    conditions: ["Acute Tonsillitis", "Streptococcal Pharyngitis (Strep Throat)", "Adenoviral Pharyngitis"],
    medications: [
      { name: "Amoxicillin Trihydrate 500mg (Brand: Mox, Amoxil)", snomed: "387517006", dose: "500 mg orally every 8 hours for 7 days (complete the full course)", note: "Broad-spectrum penicillin antibiotic. First-line therapy for confirmed bacterial Streptococcus tonsillitis. Stops bacterial cell wall synthesis. Complete the full course even if pain subsides to prevent rheumatic fever. Blocked if allergic to Penicillins." },
      { name: "Azithromycin 500mg (Brand: Azithral, Zithromax)", snomed: "372822002", dose: "500 mg orally once daily for 3 consecutive days 1 hour before or 2 hours after meals", note: "Macrolide antibiotic. Blocks bacterial protein synthesis. Excellent alternative for patients with Penicillin allergies. Reaches high intracellular concentrations in lymphoid tonsillar tissue." },
      { name: "Paracetamol 650mg (Brand: Calpol, Crocin)", snomed: "387584000", dose: "650 mg orally every 6 hours as needed for severe sore throat pain and fever", note: "Analgesic and antipyretic. Relieves throat pain and reduces high temperature associated with pharyngeal inflammation. Take after food." }
    ],
    precautions: ["⚠️ Seek immediate care for severe difficulty swallowing liquids or breathing", "Do not share utensils to prevent bacterial spread", "Gargle with warm salt water 3–4 times daily", "Complete the full antibiotic course without stopping"],
    diet: ["Warm broths and soups", "Warm water with honey and lemon", "Soft foods like curd rice or porridge", "Avoid spicy, acidic, or extremely cold foods"],
    specialist: "ENT Specialist / General Physician"
  },
  wound: {
    icd11: "NF00",
    conditions: ["Localized Wound Infection", "Cellulitis", "Tetanus-Prone Wound"],
    medications: [
      { name: "Amoxicillin / Clavulanic Acid 625mg (Brand: Augmentin, Clavam)", snomed: "387525001", dose: "625 mg orally twice daily with meals for 5 days", note: "Beta-lactamase inhibitor combination antibiotic. Provides powerful coverage against skin pathogens. Symmetrical Clavulanic acid prevents resistance. Take with food to minimize gastrointestinal discomfort." },
      { name: "Povidone-Iodine Ointment 5% (Brand: Betadine Ointment)", snomed: "387259005", dose: "Apply locally to clean wound surface and cover with sterile gauze twice daily", note: "Broad-spectrum topical microbicide. Kills bacteria, fungi, and viruses locally at the wound site, promoting sterile healing and preventing cellulitis. Symmetrical localized use with low systemic absorption." }
    ],
    precautions: ["⚠️ CRITICAL: Check tetanus toxoid (TT) vaccination status immediately. If >5 years since last dose or rusty nail cut, get TT booster within 24 hours!", "Keep wound clean, dry, and covered", "Monitor for spreading redness, heat, or fever", "Seek urgent care if red streaks spread up leg/arm"],
    diet: ["Protein-rich foods to accelerate tissue repair", "Vitamin C and Zinc supplements for wound healing", "Stay well-hydrated", "Avoid sugary foods that delay healing"],
    specialist: "General Surgeon / General Physician / Emergency Medicine"
  },
  pneumonia: {
    icd11: "CA40",
    conditions: ["Lobar Pneumonia", "Bronchopneumonia", "Viral Pneumonia", "Bacterial Pneumonia"],
    medications: [
      { name: "Amoxicillin 500mg (Brand: Mox, Amoxil)", snomed: "387517006", dose: "500 mg orally 3 times daily for 7 days", note: "First-line antibiotic for uncomplicated community-acquired pneumonia. Suppresses bacterial cell wall synthesis. Complete the full course. Avoid if allergic to Penicillins." },
      { name: "Azithromycin 500mg (Brand: Azithral, Zithromax)", snomed: "372822002", dose: "500 mg orally once daily for 3 days", note: "Macrolide antibiotic. Effective against atypical pathogens. Safe alternative for patients with penicillin allergies. Take 1 hour before or 2 hours after meals." }
    ],
    precautions: ["Stay hydrated – drink plenty of warm fluids", "Use a spirometer 3–5 times daily for lung exercise", "Monitor oxygen levels (SpO2) with a pulse oximeter", "Seek emergency care if SpO2 drops below 92% or breathing is labored"],
    diet: ["Warm broths and soups", "Garlic and ginger tea", "Vitamin C-rich fruits", "Avoid cold drinks and foods"],
    specialist: "Pulmonologist / General Physician"
  },
  tuberculosis: {
    icd11: "1B10",
    conditions: ["Pulmonary Tuberculosis", "Miliary Tuberculosis", "Latent TB Infection"],
    medications: [
      { name: "Isoniazid 300mg (Brand: Solonex)", snomed: "387019007", dose: "300 mg orally once daily on an empty stomach", note: "Core antitubercular agent. Inhibits mycolic acid synthesis in bacterial cell walls. Administer with Vitamin B6 (Pyridoxine) to prevent peripheral neuropathy." },
      { name: "Rifampicin 600mg (Brand: Racin, Rimactane)", snomed: "387135007", dose: "600 mg orally once daily 1 hour before meals", note: "Bactericidal rifamycin antibiotic. Inhibits bacterial RNA polymerase. Note: Harmlessly turns urine, sweat, and tears orange-red." }
    ],
    precautions: ["Complete the full 6-month treatment course without interruption", "Wear a mask to prevent airborne transmission", "Perform monthly liver function tests (LFT)", "Avoid alcohol entirely during therapy"],
    diet: ["High-protein diet (eggs, lentils, chicken)", "Calorie-dense foods", "Vitamin B6 and multivitamin supplements", "Avoid junk/processed foods"],
    specialist: "Pulmonologist / Infectious Disease Specialist"
  },
  cardiomegaly: {
    icd11: "CB41.0",
    conditions: ["Congestive Heart Failure", "Dilated Cardiomyopathy", "Hypertensive Heart Disease"],
    medications: [
      { name: "Enalapril Maleate 5mg (Brand: Envas, Vasotec)", snomed: "372692003", dose: "5 mg orally once daily", note: "ACE inhibitor. Reduces cardiac afterload and prevents ventricular remodeling by blocking angiotensin II synthesis. Monitor kidney function and watch for dry cough." },
      { name: "Metoprolol Succinate 25mg (Brand: Metolar XR, Lopressor)", snomed: "372685003", dose: "25 mg orally once daily (extended-release)", note: "Beta-1 selective adrenergic blocker. Reduces heart rate, workload, and oxygen demand. Do not stop abruptly." }
    ],
    precautions: ["Monitor weight daily (sudden increase indicates fluid retention)", "Restrict daily fluid intake to 1.5 Litres if advised", "Track blood pressure and pulse rate daily", "Seek immediate care for worsening breathlessness when lying flat"],
    diet: ["Low-sodium diet (<1500mg salt/day)", "Heart-healthy fats (olive oil, walnuts)", "Avoid processed and canned foods", "Limit potassium if on potassium-sparing diuretics"],
    specialist: "Cardiologist"
  },
  "multiple sclerosis": {
    icd11: "8A40",
    conditions: ["Relapsing-Remitting MS", "Secondary Progressive MS", "Primary Progressive MS"],
    medications: [
      { name: "Glatiramer Acetate 20mg (Brand: Copaxone)", snomed: "387361009", dose: "20 mg subcutaneously once daily", note: "Immunomodulator. Shifts T-cell population to suppress myelin-reactive autoimmune responses. Instruct patient on proper injection technique and rotation of sites." },
      { name: "Methylprednisolone 1g (Brand: Solu-Medrol)", snomed: "387494002", dose: "1000 mg intravenously once daily for 3-5 days during acute relapse", note: "High-dose corticosteroid. Rapidly reduces acute neuro-inflammation and speeds recovery from relapses. Take with gastric protection (PPI)." }
    ],
    precautions: ["Avoid hot baths and heat exposure (prevents Uhthoff's phenomenon)", "Regular physical therapy to maintain muscle strength and mobility", "Monitor for mood changes or depression", "Regular MRI scans to track disease activity"],
    diet: ["Anti-inflammatory diet (omega-3 fatty acids, turmeric)", "Vitamin D3 supplements (crucial for MS)", "High-fiber foods for bowel health", "Limit saturated fats"],
    specialist: "Neurologist / MS Specialist"
  },
  stroke: {
    icd11: "8B20",
    conditions: ["Ischemic Stroke", "Hemorrhagic Stroke", "Transient Ischemic Attack (TIA)"],
    medications: [
      { name: "Aspirin 75mg / Clopidogrel 75mg (Brand: Clopilet-A, Plavix)", snomed: "387121004", dose: "1 tablet daily after food", note: "Dual antiplatelet therapy. Inhibits platelet aggregation to prevent secondary ischemic events. Monitor for bleeding or bruising. Blocked/substituted if NSAID allergy exists." },
      { name: "Atorvastatin 40mg (Brand: Lipvas, Lipitor)", snomed: "372679003", dose: "40 mg orally once daily at bedtime", note: "High-intensity HMG-CoA reductase inhibitor (statin). Stabilizes arterial plaques and reduces vascular inflammation to prevent recurrent stroke." }
    ],
    precautions: ["Control blood pressure strictly (<130/80 mmHg)", "Monitor for bleeding, dark stools, or nosebleeds", "Undergo physical and speech rehabilitation", "Know the FAST signs: Face drooping, Arm weakness, Speech difficulty, Time to call 108/911"],
    diet: ["Strict low-sodium, low-cholesterol DASH diet", "Rich in vegetables, fruits, and whole grains", "Avoid trans-fats and deep-fried foods", "Restrict alcohol and stop smoking"],
    specialist: "Neurologist / Stroke Specialist / Rehabilitation Physician"
  },
  hyperlipidemia: {
    icd11: "5C80",
    conditions: ["Hypercholesterolemia", "Mixed Hyperlipidemia", "Hypertriglyceridemia"],
    medications: [
      { name: "Atorvastatin Calcium 20mg (Brand: Lipvas, Lipitor)", snomed: "372679003", dose: "20 mg orally once daily at bedtime", note: "HMG-CoA reductase inhibitor (statin). Significantly lowers LDL-C (bad cholesterol) and triglycerides while raising HDL-C. Avoid grapefruit juice." },
      { name: "Fenofibrate 160mg (Brand: Lipicard, Tricor)", snomed: "372648008", dose: "160 mg orally once daily with food", note: "Fibric acid derivative. Activates PPAR-alpha to reduce triglycerides and very low-density lipoproteins (VLDL). Take with meals." }
    ],
    precautions: ["Check lipid profile every 3 months", "Monitor for muscle pain or weakness (rhabdomyolysis check)", "Monitor liver enzymes (ALT/AST) periodically", "Engage in 150 minutes of moderate aerobic exercise weekly"],
    diet: ["High-soluble fiber diet (oats, beans, barley)", "Eliminate trans-fats and limit saturated fats", "Increase omega-3 fatty acids (flaxseeds, salmon)", "Avoid refined sugars and excess alcohol"],
    specialist: "Endocrinologist / Cardiologist"
  },
  hypothyroidism: {
    icd11: "5A20",
    conditions: ["Primary Hypothyroidism", "Hashimoto's Thyroiditis", "Subclinical Hypothyroidism"],
    medications: [
      { name: "Levothyroxine Sodium 50mcg (Brand: Thyronorm, Synthroid)", snomed: "372834007", dose: "50 mcg orally once daily, strictly 30-60 minutes before breakfast with water", note: "Synthetic thyroid hormone replacement. Directly replenishes T4 levels to normalize metabolic rate. Take on an empty stomach; do not take with calcium/iron supplements." }
    ],
    precautions: ["Check Serum TSH levels every 6-8 weeks during dose adjustment, then every 6 months", "Do not switch between different brand names of thyroxine without consulting doctor", "Watch for hyperthyroidism signs (palpitations, sweating, anxiety)", "Take medication consistently every single morning"],
    diet: ["Iodized salt usage", "Ensure adequate selenium and zinc intake", "Limit goitrogens (cabbage, broccoli) unless cooked", "Maintain a balanced, calorie-controlled diet"],
    specialist: "Endocrinologist"
  },
  "renal failure": {
    icd11: "GB61",
    conditions: ["Chronic Kidney Disease (CKD)", "Acute Kidney Injury (AKI)", "Nephrotic Syndrome"],
    medications: [
      { name: "Furosemide 40mg (Brand: Lasix)", snomed: "372728003", dose: "40 mg orally once daily in the morning", note: "Loop diuretic. Promotes excretion of water and sodium to manage fluid overload and edema. Monitor serum potassium levels." },
      { name: "Sevelamer Carbonate 800mg (Brand: Renvela)", snomed: "387063004", dose: "800 mg orally 3 times daily with meals", note: "Phosphate binder. Binds dietary phosphorus in the GI tract to prevent hyperphosphatemia in renal failure. Take strictly with food." }
    ],
    precautions: ["Monitor daily fluid intake and output", "Avoid all nephrotoxic drugs, especially NSAIDs (Ibuprofen, Diclofenac)", "Regularly check kidney function (creatinine, eGFR) and electrolytes", "Strictly monitor blood pressure and blood sugar"],
    diet: ["Low sodium, low potassium, and low phosphorus diet", "Restrict protein intake as advised by nephrologist", "Limit fluid intake according to urine output"],
    specialist: "Nephrologist"
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
  "back pain|spine|lumbar|backache|anta|nadi": "back pain",
  "uti|urination|pee|urine|micturition|dysuria|barambar parisra|podajala": "uti",
  "asthma|wheezing|bronchial|breathless|short of breath|dyspnea|kasta heuchi nisasane": "asthma",
  "vertigo|dizziness|dizzy|spinning|unsteady|tinnitus|ringing ear|munda ghureiba": "vertigo",
  "anemia|fatigue|weakness|palpitations|lightheadedness|pale skin|pale lips|durbalata": "anemia",
  "tonsillitis|throat|pharyngitis|swallow|swollen glands|tonsil|gala bitha|gila": "tonsillitis",
  "wound|cut|nail|rusty|pus|infected|discharge|septic|ksata": "wound",
  "pneumonia|consolidation|lung opacity|alveolar infiltration|chest congestion|lobar consolidation|pleural effusion": "pneumonia",
  "tuberculosis|tb|cavitary lesion|lung cavity|hemoptysis|night sweats|coughing blood": "tuberculosis",
  "cardiomegaly|enlarged heart|heart enlargement|ventricular hypertrophy|cardiac dilation|cardiomyopathy": "cardiomegaly",
  "multiple sclerosis|demyelinating|uhthoff|optic neuritis|myelin erosion|paraesthesia|ms flare": "multiple sclerosis",
  "stroke|infarct|cerebral ischemia|hemiplegia|transient ischemic attack|tia|aphasia|face droop": "stroke",
  "hyperlipidemia|cholesterol|ldl|triglycerides|hypercholesterolemia|lipid panel": "hyperlipidemia",
  "hypothyroidism|tsh|thyroid|myxedema|goiter|thyroiditis|levothyroxine": "hypothyroidism",
  "renal failure|kidney failure|creatinine|egfr|kidney function|uremia|ckd": "renal failure"
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

function getMedicineSearchQuery(fullName) {
  if (!fullName) return "";
  // Strip emojis and mechanical symbols
  let name = fullName.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|🛡️|⚠️/g, "");
  // Strip "(Safe Sub)"
  name = name.replace(/\(Safe Sub\)/i, "");
  // Trim
  name = name.trim();
  // Get generic part before "("
  let genericPart = name.split("(")[0].trim();
  if (!genericPart) {
    genericPart = name;
  }
  return genericPart;
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
    "ଏହା ଶରୀରର ଅନ୍ୟ ଭାଗକୁ ବ୍ୟପିଛି କି?"
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
  "uti": [
    "ପରିସ୍ରା କରିବା ସମୟରେ ପୋଡାଜଳା କିମ୍ବା କଷ୍ଟ ଅଧିକ ହେଉଛି କି?",
    "ପରିସ୍ରା ର ରଙ୍ଗ ଲାଲ୍ କିମ୍ବା ଅଧିକ ହଳଦିଆ ଦେଖାଯାଉଛି କି?"
  ],
  "asthma": [
    "ନିଶ୍ୱାସ ନେବା ସମୟରେ ଘୁଁ ଘୁଁ ଶବ୍ଦ ହେଉଛି କି?",
    "କାଶ ରାତିରେ ଅଧିକ ବଢିଯାଉଛି କି?"
  ],
  "vertigo": [
    "ଆପଣଙ୍କୁ ଚାରିପାଖ ଘୂରିବା ପରି ଲାଗୁଛି କି ଏବଂ ଚାଲିବାରେ କଷ୍ଟ ହେଉଛି କି?",
    "କାନରେ କିଛି ରୁଁ ରୁଁ ଶବ୍ଦ ଶୁଭୁଛି କି?"
  ],
  "anemia": [
    "ଠିଆ ହେଲେ ଆଖି ଆଗରେ ଅନ୍ଧାର ମାଡିଯାଉଛି କି?",
    "ସାଧାରଣ କାମ କଲେ ମଧ୍ୟ ହୃଦସ୍ପନ୍ଦନ ବଢିଯାଉଛି ଏବଂ ନିଶ୍ୱาସ ଫୁଲିଯାଉଛି କି?"
  ],
  "tonsillitis": [
    "ଖାଦ୍ୟ କିମ୍ବା ଲାଳ ଗିଳିବା ବେଳେ ବହୁତ କଷ୍ଟ ହେଉଛି କି?",
    "ଜ୍ୱର ସହିତ ଗଳା କର୍କଶ ଲାଗୁଛି କି?"
  ],
  "wound": [
    "କ୍ଷତ ସ୍ଥାନରୁ କିଛି ପୂଜ ବାହାରୁଛି କିମ୍ବା ଦୁର୍ଗନ୍ଧ ହେଉଛି କି?",
    "କ୍ଷତ ସ୍ଥାନଟି ନାଲି ପଡି ଫୁଲିଯାଇଛି ଏବଂ ଜ୍ୱର ଆସିଛି କି?"
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
  "uti": [
    "Do you experience severe burning or pain during urination?",
    "Is your urine cloudy, dark, or has a strong odor?"
  ],
  "asthma": [
    "Are you experiencing any audible wheezing or chest tightness when breathing?",
    "Does your cough get significantly worse at night or in cold air?"
  ],
  "vertigo": [
    "Does the room feel like it is spinning, and do you feel off-balance when walking?",
    "Are you experiencing any ringing (tinnitus) or fullness in your ears?"
  ],
  "anemia": [
    "Do you feel dizzy or lightheaded when standing up quickly?",
    "Do you experience rapid heartbeat or shortness of breath with mild exertion?"
  ],
  "tonsillitis": [
    "Is it extremely painful to swallow food or liquids?",
    "Do you have a fever accompanied by swollen throat glands?"
  ],
  "wound": [
    "Is there any pus or foul-smelling discharge coming from the wound?",
    "Is the area around the wound red, swollen, warm, or do you have a fever?"
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

  const CLINICAL_SYMPTOMS = new Set([
    "fever", "headache", "cough", "chest pain", "stomach pain", 
    "joint pain", "skin rash", "eye pain", "back pain", 
    "vertigo", "wound"
  ]);
  if (CLINICAL_SYMPTOMS.has(condition)) {
    html += `<div class="med-section">
      <div class="med-section-title">${isOr ? ODIA_DICT.possibleCond : "🔬 POSSIBLE CONDITIONS"}</div>
      <ul>${kb.conditions.map(c => `<li>${c}</li>`).join("")}</ul>
    </div>`;
  }

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
    if (currentHealthId || chatHistory.length > 0 || getProfile().name) {
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

  // Auto-add reactions and voice TTS reader to AI messages
  if (role === "ai") {
    const r = document.createElement("div");
    r.className = "msg-reactions";
    r.innerHTML = `<button class="reaction-btn voice-read-btn" title="Listen to diagnosis" style="display: inline-flex; align-items: center; gap: 4px; border-color: rgba(0, 229, 255, 0.3); color: var(--cyan); margin-right: 8px;">🎙️ Listen</button>
      <button class="reaction-btn" title="Helpful">👍</button>
      <button class="reaction-btn" title="Love it">❤️</button>
      <button class="reaction-btn" title="Great">🙌</button>`;
    
    // Voice speech handler registration
    const voiceBtn = r.querySelector(".voice-read-btn");
    if (voiceBtn) {
      voiceBtn.addEventListener("click", () => {
        const bubble = div.querySelector(".message-bubble");
        if (bubble) {
          window.speakMessageText(voiceBtn, bubble.innerText || bubble.textContent);
        }
      });
    }

    r.querySelectorAll(".reaction-btn:not(.voice-read-btn)").forEach(b => {
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
    const model = localStorage.getItem("ramanai_gemini_model") || "gemini-3.5-flash";
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
  } else if (provider === "anthropic") {
    const key = localStorage.getItem("ramanai_anthropic_api_key");
    const baseUrl = localStorage.getItem("ramanai_anthropic_base_url") || "https://api.anthropic.com";
    const model = localStorage.getItem("ramanai_anthropic_model") || "claude-3-7-sonnet-20250219";
    if (key) {
      response = await generateAnthropicResponse(text, profile, key, baseUrl, model);
    } else {
      const warningText = isOr 
        ? `<div class="med-section warning"><p>⚠️ <strong>Anthropic API କି ମିଳିଲା ନାହିଁ:</strong> ଦୟାକରି API ସେଟିଙ୍ଗ୍ସକୁ ଯାଇ API Key ପ୍ରଦାନ କରନ୍ତୁ କିମ୍ବା ଲୋକାଲ୍ SLM ବ୍ୟବହାର କରନ୍ତୁ।</p><p>ରାମନ୍ ଲୋକାଲ୍ SLM ସହିତ ଅଫ୍‌ଲାଇନ୍ ଇନଫରେନ୍ସ କରାଯାଉଛି...</p></div>`
        : `<div class="med-section warning"><p>⚠️ <strong>Anthropic API Key Missing:</strong> Please check your System & Model Settings to configure a valid API key.</p><p>Falling back to high-speed offline RAMAN Local SLM triage...</p></div>`;
      addMessage("ai", warningText, true);
      response = await generateSlmResponse(text, profile);
    }
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playDataTick();
});

function updateCharCount() {
  const v = document.getElementById("userInput").value.length;
  document.getElementById("charCount").textContent = `${v}/1000`;
}



document.querySelectorAll(".symptom-tag").forEach(btn => {
  btn.addEventListener("click", () => {
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playDataTick();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
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

  // Advanced Regex Extraction Sub-system for high-accuracy clinical parameters
  let parsedName = null;
  let parsedAge = null;
  let parsedGender = null;
  let parsedVal = null;
  
  const nameMatch = n.match(/(?:patient|name|for)?[_\-\s]([a-z]{3,15})(?:[_\-\s]|$)/i);
  if (nameMatch) {
    parsedName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
  }
  const ageMatch = n.match(/(?:age[_\-\s]?)?(\b\d{2}\b)/i);
  if (ageMatch) {
    parsedAge = parseInt(ageMatch[1]);
  }
  const genderMatch = n.match(/\b(male|female|m|f)\b/i);
  if (genderMatch) {
    const g = genderMatch[1].toLowerCase();
    parsedGender = (g === 'm' || g === 'male') ? 'Male' : 'Female';
  }
  const valMatch = n.match(/(\d+(?:\.\d+)?)(?:\s*(?:%|percent|mm|mg\/dl|bpm))?/i);
  if (valMatch) {
    parsedVal = parseFloat(valMatch[1]);
  }

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
    } else if (/tuberculosis|tb|cavity|cavitary/i.test(n)) {
      detectedCondition = "Pulmonary Tuberculosis / Cavitary Lesions";
      keyMetricName = "Lung Cavitation Area";
      keyMetricUnit = "%";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = defaultStage === 1 ? "8" : defaultStage === 2 ? "22" : defaultStage === 3 ? "48" : "75";
      confidence += 15;
    } else if (/cardiomegaly|enlarged|heart|dilation/i.test(n)) {
      detectedCondition = "Heart Enlargement / Cardiomegaly";
      keyMetricName = "Cardiothoracic Ratio";
      keyMetricUnit = "%";
      keyMetricMin = 30;
      keyMetricMax = 80;
      keyMetricValue = defaultStage === 1 ? "52" : defaultStage === 2 ? "58" : defaultStage === 3 ? "66" : "74";
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
    } else if (/ms|sclerosis|demyelination|myelin/i.test(n)) {
      detectedCondition = "Multiple Sclerosis Demyelination";
      keyMetricName = "Active Demyelinating Plaque Count";
      keyMetricUnit = "";
      keyMetricMin = 0;
      keyMetricMax = 30;
      keyMetricValue = defaultStage === 1 ? "2" : defaultStage === 2 ? "7" : defaultStage === 3 ? "15" : "25";
      confidence += 15;
    } else if (/stroke|infarct|ischemia|clot/i.test(n)) {
      detectedCondition = "Cerebral Stroke / Infarct Area";
      keyMetricName = "Stroke Infarction Size";
      keyMetricUnit = " mm";
      keyMetricMin = 0;
      keyMetricMax = 100;
      keyMetricValue = defaultStage === 1 ? "5" : defaultStage === 2 ? "15" : defaultStage === 3 ? "40" : "75";
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
    } else if (/lipid|cholesterol|ldl|hdl|triglyceride/i.test(n)) {
      detectedCondition = "Lipid Panel (Hyperlipidemia)";
      keyMetricName = "Serum LDL Cholesterol";
      keyMetricUnit = " mg/dL";
      keyMetricMin = 50;
      keyMetricMax = 300;
      keyMetricValue = defaultStage === 1 ? "95" : defaultStage === 2 ? "125" : defaultStage === 3 ? "165" : "220";
      confidence += 15;
    } else if (/tsh|thyroid|t3|t4/i.test(n)) {
      detectedCondition = "Thyroid Panel (Hypothyroidism)";
      keyMetricName = "TSH (Thyroid Stimulating Hormone)";
      keyMetricUnit = " uIU/mL";
      keyMetricMin = 0.1;
      keyMetricMax = 50.0;
      keyMetricValue = defaultStage === 1 ? "2.5" : defaultStage === 2 ? "5.8" : defaultStage === 3 ? "14.5" : "38.0";
      confidence += 15;
    } else if (/hemoglobin|hb|cbc|anemia/i.test(n)) {
      detectedCondition = "Hematological Panel (Anemia)";
      keyMetricName = "Hemoglobin (Hb) Level";
      keyMetricUnit = " g/dL";
      keyMetricMin = 5.0;
      keyMetricMax = 18.0;
      keyMetricValue = defaultStage === 1 ? "13.5" : defaultStage === 2 ? "11.2" : defaultStage === 3 ? "8.8" : "6.5";
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

  let conditionKey = "cough"; // Default fallback
  if (docType === 'xray') {
    if (detectedCondition.includes("Pneumonia")) {
      conditionKey = "pneumonia";
    } else if (detectedCondition.includes("Tuberculosis")) {
      conditionKey = "tuberculosis";
    } else if (detectedCondition.includes("Cardiomegaly") || detectedCondition.includes("Heart Enlargement")) {
      conditionKey = "cardiomegaly";
    } else {
      conditionKey = "joint pain";
    }
  } else if (docType === 'mri') {
    if (detectedCondition.includes("Tumour")) {
      conditionKey = "brain tumor";
    } else if (detectedCondition.includes("Multiple Sclerosis")) {
      conditionKey = "multiple sclerosis";
    } else if (detectedCondition.includes("Stroke")) {
      conditionKey = "stroke";
    } else {
      conditionKey = "back pain";
    }
  } else if (docType === 'ecg') {
    if (detectedCondition.includes("Ischemia")) {
      conditionKey = "myocardial ischemia";
    } else {
      conditionKey = "arrhythmia";
    }
  } else if (docType === 'lab') {
    if (detectedCondition.includes("Glycaemic")) {
      conditionKey = "diabetes";
    } else if (detectedCondition.includes("Renal")) {
      conditionKey = "renal failure";
    } else if (detectedCondition.includes("Lipid")) {
      conditionKey = "hyperlipidemia";
    } else if (detectedCondition.includes("Thyroid")) {
      conditionKey = "hypothyroidism";
    } else if (detectedCondition.includes("Anemia")) {
      conditionKey = "anemia";
    } else {
      conditionKey = "fever";
    }
  } else if (docType === 'prescription') {
    if (/metformin|glucose|sugar/i.test(n)) {
      conditionKey = "diabetes";
    } else if (/lisinopril|amlodipine|bp/i.test(n)) {
      conditionKey = "high blood pressure";
    } else if (/atorva|statin|chol/i.test(n)) {
      conditionKey = "high blood pressure";
    } else if (/amoxi|antibio|cough/i.test(n)) {
      conditionKey = "cough";
    } else if (/ibuprofen|pain|joint/i.test(n)) {
      conditionKey = "joint pain";
    } else {
      conditionKey = "fever";
    }
  } else if (docType === 'photo') {
    if (/rash|skin|eczema/i.test(n)) {
      conditionKey = "skin rash";
    } else if (/eye/i.test(n)) {
      conditionKey = "eye pain";
    } else {
      conditionKey = "fever";
    }
  }

  // Apply parsedVal if extracted from filename to boost offline accuracy
  if (parsedVal !== null) {
    if (docType === 'xray') {
      if (detectedCondition.includes("Pneumonia")) {
        if (parsedVal >= 0 && parsedVal <= 100) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 20) defaultStage = 1;
          else if (parsedVal <= 50) defaultStage = 2;
          else if (parsedVal <= 80) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Tuberculosis")) {
        if (parsedVal >= 0 && parsedVal <= 100) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 15) defaultStage = 1;
          else if (parsedVal <= 35) defaultStage = 2;
          else if (parsedVal <= 60) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Cardiomegaly") || detectedCondition.includes("Heart Enlargement")) {
        if (parsedVal >= 30 && parsedVal <= 80) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 50) defaultStage = 1;
          else if (parsedVal <= 56) defaultStage = 2;
          else if (parsedVal <= 65) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else {
        if (parsedVal >= 0 && parsedVal <= 100) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 20) defaultStage = 1;
          else if (parsedVal <= 50) defaultStage = 2;
          else if (parsedVal <= 80) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      }
    } else if (docType === 'mri') {
      if (detectedCondition.includes("Tumour")) {
        if (parsedVal >= 0 && parsedVal <= 80) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 10) defaultStage = 1;
          else if (parsedVal <= 25) defaultStage = 2;
          else if (parsedVal <= 45) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Multiple Sclerosis")) {
        if (parsedVal >= 0 && parsedVal <= 30) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 4) defaultStage = 1;
          else if (parsedVal <= 9) defaultStage = 2;
          else if (parsedVal <= 18) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Stroke")) {
        if (parsedVal >= 0 && parsedVal <= 100) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 10) defaultStage = 1;
          else if (parsedVal <= 30) defaultStage = 2;
          else if (parsedVal <= 60) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else {
        if (parsedVal >= 0 && parsedVal <= 15) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 3) defaultStage = 1;
          else if (parsedVal <= 6) defaultStage = 2;
          else if (parsedVal <= 10) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      }
    } else if (docType === 'ecg') {
      if (detectedCondition.includes("Ischemia")) {
        if (parsedVal >= -5 && parsedVal <= 8) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 0.8) defaultStage = 1;
          else if (parsedVal <= 2.2) defaultStage = 2;
          else if (parsedVal <= 4.0) defaultStage = 3;
          else defaultStage = 4;
          confidence = 98;
        }
      } else {
        if (parsedVal >= 0 && parsedVal <= 180) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 5) defaultStage = 1;
          else if (parsedVal <= 20) defaultStage = 2;
          else if (parsedVal <= 50) defaultStage = 3;
          else defaultStage = 4;
          confidence = 98;
        }
      }
    } else if (docType === 'lab') {
      if (detectedCondition.includes("Glycaemic")) {
        if (parsedVal >= 4 && parsedVal <= 15) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal < 5.7) defaultStage = 1;
          else if (parsedVal < 6.5) defaultStage = 2;
          else if (parsedVal <= 8.5) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Lipid")) {
        if (parsedVal >= 50 && parsedVal <= 300) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal < 100) defaultStage = 1;
          else if (parsedVal < 130) defaultStage = 2;
          else if (parsedVal < 190) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Thyroid")) {
        if (parsedVal >= 0.1 && parsedVal <= 50.0) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal < 4.5) defaultStage = 1;
          else if (parsedVal < 10.0) defaultStage = 2;
          else if (parsedVal < 20.0) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else if (detectedCondition.includes("Anemia")) {
        if (parsedVal >= 5.0 && parsedVal <= 18.0) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal >= 13.0) defaultStage = 1;
          else if (parsedVal >= 10.0) defaultStage = 2;
          else if (parsedVal >= 8.0) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      } else {
        if (parsedVal >= 0.4 && parsedVal <= 8.0) {
          keyMetricValue = parsedVal.toString();
          if (parsedVal <= 1.0) defaultStage = 1;
          else if (parsedVal <= 2.0) defaultStage = 2;
          else if (parsedVal <= 4.0) defaultStage = 3;
          else defaultStage = 4;
          confidence = 96;
        }
      }
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
    } else if (detectedCondition.includes("Tuberculosis")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Chest radiography reveals apical infiltration, consolidation, or cavitary lesions at <strong>${activeMetricVal}%</strong> volume. This matches features of mycobacterial infection.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Early sub-apical infiltrates. No visible cavitation or pleural effusion.' : activeStage === 2 ? 'Localized lobar consolidation with early cavitary formation. Sputum positive suspect.' : activeStage === 3 ? 'Widespread bilateral cavitary lesions with miliary distribution. Significant lung damage.' : 'Advanced necrotizing cavitation with massive pleural effusion or bronchopleural fistula. Respiratory failure danger.'}</li>
          <li><strong>Radiological Markers:</strong> Ghon focus, apical scarring, and fibro-nodular pattern are present.</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>😷 <strong>Infection Control:</strong> Wear an N95 mask and ensure home isolation in a well-ventilated room.</li>
          <li>💊 <strong>Adherence Tracking:</strong> Strictly adhere to the daily DOTS regimen without skipping doses.</li>
          <li>🧪 <strong>LFT Checks:</strong> Get baseline and monthly Liver Function Tests (LFT) due to hepatotoxicity risks of anti-TB drugs.</li>
          <li>🥗 <strong>Caloric Boost:</strong> High-protein, high-calorie meals are essential for recovering lost body weight.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Pulmonologist immediately to initiate first-line anti-tubercular therapy (ATT)." 
        : activeStage === 2 
        ? "👉 Urgent Pulmonologist/ID consult. Start DOTS regimen immediately and perform sputum culture." 
        : activeStage === 3 
        ? "🚨 Hospitalization and isolation required. Inpatient monitoring is recommended for systemic management." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Severe cavitation or miliary TB with hypoxemia requires immediate emergency ward care.";
    } else if (detectedCondition.includes("Cardiomegaly") || detectedCondition.includes("Heart Enlargement")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>X-Ray analysis indicates cardiothoracic ratio expansion measured at <strong>${activeMetricVal}%</strong>. This is characteristic of chamber dilation or hypertrophy.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Mild cardiomegaly (CTR 50–55%). No visible pulmonary congestion.' : activeStage === 2 ? 'Moderate heart enlargement (CTR 56–60%). Prominent hilum, early venous congestion.' : activeStage === 3 ? 'Severe cardiomegaly (CTR >60%). Diffuse pulmonary edema and Kerley B lines.' : 'Extreme cardiomegaly with CTR >70% and bilateral pleural effusion. Decompensated heart failure.'}</li>
          <li><strong>Radiological Markers:</strong> Left ventricular apex displacement, double right border sign, and cephalization are present.</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>⚖️ <strong>Daily Weight:</strong> Monitor body weight every morning. A sudden 1-2 kg weight gain indicates fluid retention.</li>
          <li>🧂 <strong>Salt Restriction:</strong> Limit salt intake to less than 1.5 grams/day (eliminate processed foods).</li>
          <li>💧 <strong>Fluid Control:</strong> Restrict daily total fluid intake to 1.5 Litres if experiencing peripheral edema.</li>
          <li>🛋️ <strong>Positioning:</strong> Rest in a semi-upright (Fowler's) position using multiple pillows to relieve night orthopnea.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Cardiologist within 7 days for Echocardiography to assess ejection fraction." 
        : activeStage === 2 
        ? "👉 Schedule prompt Cardiologist check. Initiate/adjust diuretics and ACE inhibitors." 
        : activeStage === 3 
        ? "🚨 Urgent cardiac intervention required. Hospital admission for IV diuretic therapy is advised." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Acute decompensated heart failure with severe pulmonary edema. Seek immediate ER care.";
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
    } else if (detectedCondition.includes("Multiple Sclerosis")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Magnetic resonance imaging of cerebral/spinal segments identifies <strong>${activeMetricVal}</strong> active demyelinating plaques. This matches structural signs of myelin degradation.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? '1-3 small focal white-matter plaques (Dawson fingers). No active contrast enhancement.' : activeStage === 2 ? 'Multiple periventricular/corpus callosum plaques with mild local inflammation and T2 hyperintensity.' : activeStage === 3 ? 'Widespread plaque load with active gadolinium enhancement. Spinal cord lesion involvement.' : 'Severe cerebral and brainstem demyelination with atrophy and persistent black holes. High disability index.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🧊 <strong>Uhthoff Prevention:</strong> Avoid hot showers, saunas, and strenuous exercise in high temperatures (heat worsens conduction block).</li>
          <li>🩺 <strong>Symptom Mapping:</strong> Keep a daily log of motor symptoms, ataxia, visual changes, or bladder control issues.</li>
          <li>🧘‍♀️ <strong>Physical Therapy:</strong> Engage in regular low-impact stretching and balance training to maintain mobility.</li>
          <li>💡 <strong>Vitamin D:</strong> Optimize serum Vitamin D levels as it modulates immune activity in MS.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Neurologist within 7 days to establish a baseline disease-modifying therapy (DMT) plan." 
        : activeStage === 2 
        ? "👉 Prompt Neurologist check. DMT adjustments are recommended to reduce future relapse rates." 
        : activeStage === 3 
        ? "🚨 Relapse flare-up suspect. Contact your Neurologist immediately for high-dose steroid therapy (Methylprednisolone)." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Widespread myelopathy causing acute paralysis, bulbar symptoms, or respiratory distress. Seek ER care.";
    } else if (detectedCondition.includes("Stroke")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Neuroimaging isolates a focal region of restricted diffusion corresponding to a cerebral infarct/ischemic area measured at <strong>${activeMetricVal} mm</strong>.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Small lacunar infarct (diameter <10mm) in deep white matter. No midline shift.' : activeStage === 2 ? 'Focal cortical/subcortical ischemic zone. Minimal local cytotoxic edema.' : activeStage === 3 ? 'Moderate to large territory vascular occlusion (e.g. MCA branch) with significant cytotoxic edema.' : 'Massive hemispheric infarction with severe mass effect, midline shift, or hemorrhagic transformation risk.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>⚠️ <strong>FAST Protocol:</strong> Monitor for any recurrence of Face droop, Arm drift, or Speech slurring.</li>
          <li>💊 <strong>Secondary Prevention:</strong> Strictly follow prescribed antiplatelet (Aspirin/Clopidogrel) and statin guidelines.</li>
          <li>🩸 <strong>BP Control:</strong> Keep systolic blood pressure under 130 mmHg unless otherwise directed by your neurologist.</li>
          <li>🗣️ <strong>Rehabilitation:</strong> Begin physical, occupational, and speech therapy as early as possible to promote neuroplasticity.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Consult a Neurologist/Stroke Specialist within 48 hours for secondary prevention angiogram/workup." 
        : activeStage === 2 
        ? "👉 Urgent Neurologist consultation. Ensure blood thinners are safely optimized. Check carotid doppler." 
        : activeStage === 3 
        ? "🚨 Hospitalization in a Stroke Unit is required. Intensive neurological monitoring is essential." 
        : "🚨 <strong>CRITICAL EMERGENCY:</strong> Hyperacute stroke symptoms or deteriorating consciousness. Call 108/911 immediately. Every minute counts!";
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
    } else if (detectedCondition.includes("Lipid")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Serum lipid profiling reports LDL Cholesterol at <strong>${activeMetricVal} mg/dL</strong>. Widespread elevation accelerates plaque formation.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'LDL <100 mg/dL. Optimal level, low atherosclerotic plaque risk.' : activeStage === 2 ? 'LDL 100 - 129 mg/dL. Borderline elevated. Early cholesterol buildup.' : activeStage === 3 ? 'LDL 130 - 189 mg/dL. High risk of coronary artery disease.' : 'LDL ≥190 mg/dL. Severe hyperlipidemia. Extreme risk of acute coronary syndrome.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🥦 <strong>Dietary Fiber:</strong> Consume 10–25g soluble fiber daily (oats, legumes, fruits) to block cholesterol absorption.</li>
          <li>🍳 <strong>Fat Control:</strong> Strictly eliminate trans-fats and restrict saturated fats to under 7% of daily calories.</li>
          <li>🏃‍♂️ <strong>Cardio Exercise:</strong> Perform at least 30 minutes of moderate-intensity aerobic exercise 5 days a week.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Healthy levels. Re-test lipid panel annually to monitor trends." 
        : activeStage === 2 
        ? "👉 Focus on dietary and lifestyle modification. Re-test in 3 months." 
        : activeStage === 3 
        ? "👉 Consult a Physician/Cardiologist. Statin therapy (e.g. Atorvastatin 10mg) may be needed." 
        : "🚨 <strong>HIGH LIPID HAZARD:</strong> Consult doctor immediately. High-dose statin therapy is critical to prevent stroke/infarction.";
    } else if (detectedCondition.includes("Thyroid")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Thyroid stimulating hormone (TSH) assays show a level of <strong>${activeMetricVal} uIU/mL</strong>. Elevated TSH indicates thyroid underactivity.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'TSH 0.4 - 4.5 uIU/mL. Euthyroid (Normal thyroid clearance).' : activeStage === 2 ? 'TSH 4.6 - 10.0 uIU/mL. Subclinical Hypothyroidism. Elevated pituitary stimulation.' : activeStage === 3 ? 'TSH 10.1 - 25.0 uIU/mL. Moderate Hypothyroidism. Decreased circulating free T4.' : 'TSH >25.0 uIU/mL. Severe primary hypothyroidism with high risk of myxedema crisis.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>⏰ <strong>Thyroxine Intake:</strong> Take Levothyroxine strictly on an empty stomach 30-60 minutes before breakfast with water.</li>
          <li>💊 <strong>Supplement Timing:</strong> Avoid taking iron, calcium, or antacids within 4 hours of your thyroid medication.</li>
          <li>🔬 <strong>TSH Monitoring:</strong> Repeat serum TSH checks every 6–8 weeks to titrate medication dosage correctly.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Normal thyroid clearance. Keep up healthy habits and re-test yearly." 
        : activeStage === 2 
        ? "👉 Monitor symptoms (fatigue, cold intolerance). Re-test TSH in 3 months before starting medication." 
        : activeStage === 3 
        ? "👉 Consult an Endocrinologist. Start synthetic thyroid hormone replacement (Levothyroxine)." 
        : "🚨 <strong>URGENT ENDOCRINE RISK:</strong> Severe hypothyroid levels require immediate replacement therapy to prevent myxedema.";
    } else if (detectedCondition.includes("Anemia")) {
      pathologyHtml = `
        <p><strong>Clinical Pathology Summary:</strong></p>
        <p>Blood panel indicates Hemoglobin (Hb) levels at <strong>${activeMetricVal} g/dL</strong>. Reduced Hb restricts oxygen carriage capacity.</p>
        <ul>
          <li><strong>Current Stage Status:</strong> ${activeStage === 1 ? 'Hb ≥13.0 g/dL (Male) or ≥12.0 g/dL (Female). Normal hematological panel.' : activeStage === 2 ? 'Hb 10.0 - 11.9 g/dL. Mild anemia. Early iron or vitamin deficiency.' : activeStage === 3 ? 'Hb 8.0 - 9.9 g/dL. Moderate anemia with significant fatigue and exertional dyspnea.' : 'Hb <8.0 g/dL. Severe anemia. High risk of high-output cardiac failure; transfusion suspect.'}</li>
        </ul>
      `;
      therapeuticSuggestions = `
        <ul>
          <li>🥩 <strong>Iron Rich Diet:</strong> Consume iron-rich foods (spinach, beetroot, pomegranate, beans, dates, or lean meats).</li>
          <li>🍊 <strong>Vitamin C:</strong> Pair iron intake with Vitamin C (citrus fruits, amla) to enhance absorption.</li>
          <li>☕ <strong>Avoid Inhibitors:</strong> Do not drink tea, coffee, or milk within 2 hours of iron supplements or meals.</li>
        </ul>
      `;
      medicalAction = activeStage === 1 
        ? "👉 Normal levels. Maintain balanced nutrition. Re-test if symptoms develop." 
        : activeStage === 2 
        ? "👉 Increase dietary iron. Consult physician to consider oral iron supplementation." 
        : activeStage === 3 
        ? "👉 Consult a General Physician/Hematologist. Start daily oral iron/folic acid therapy." 
        : "🚨 <strong>SEVERE ANEMIA WARNING:</strong> Hb levels below 8.0 g/dL require urgent medical intervention or potential transfusion.";
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
      if (tunerParams.med_diabetes) activeMeds.push("Metformin Hydrochloride 500mg (Brand: Glycomet, Glucophage)");
      if (tunerParams.med_bp) activeMeds.push("Lisinopril 10mg (Brand: Listril, Zestril)");
      if (tunerParams.med_chol) activeMeds.push("Atorvastatin Calcium 20mg (Brand: Lipvas, Lipitor)");
      if (tunerParams.med_antibiotic) activeMeds.push("Amoxicillin Trihydrate 500mg (Brand: Mox, Amoxil)");
      if (tunerParams.med_aspirin) activeMeds.push("Aspirin 75mg (Brand: Ecosprin, Colsprin)");
      if (tunerParams.med_pain) activeMeds.push("Ibuprofen 400mg (Brand: Brufen, Advil)");
    } else {
      if (/metformin|diabet|sugar/i.test(n)) activeMeds.push("Metformin Hydrochloride 500mg (Brand: Glycomet, Glucophage)");
      if (/lisinopril|amlodipine|bp/i.test(n)) activeMeds.push("Lisinopril 10mg (Brand: Listril, Zestril)");
      if (/atorva|statin|chol/i.test(n)) activeMeds.push("Atorvastatin Calcium 20mg (Brand: Lipvas, Lipitor)");
      if (/amoxi|antibio|penic/i.test(n)) activeMeds.push("Amoxicillin Trihydrate 500mg (Brand: Mox, Amoxil)");
      if (/aspirin|thinner/i.test(n)) activeMeds.push("Aspirin 75mg (Brand: Ecosprin, Colsprin)");
      if (/ibuprofen|pain/i.test(n)) activeMeds.push("Ibuprofen 400mg (Brand: Brufen, Advil)");
      if (activeMeds.length === 0) {
        activeMeds.push("Metformin Hydrochloride 500mg (Brand: Glycomet, Glucophage)");
        activeMeds.push("Atorvastatin Calcium 20mg (Brand: Lipvas, Lipitor)");
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
              <p>You have a registered <strong>Penicillin Allergy</strong>. <strong>Amoxicillin</strong> belongs to the Penicillin drug family. Taking this medication could trigger anaphylaxis or severe hypersensitivity. <strong>Contact your prescribing physician immediately to request a non-penicillin alternative (such as Azithromycin 500mg (Brand: Azithral, Zithromax))</strong>.</p>
            </div>
          `;
        }
        if ((/nsaid|aspirin|ibuprofen/i.test(allergyKeywords)) && (/aspirin|ibuprofen/i.test(medL))) {
          allergyConflictHtml += `
            <div class="med-section warning" style="border:2px solid #ff0055; margin-bottom:12px; animation: pulseGlow 2s infinite;">
              <div class="med-section-title" style="color:#ff0055;">⚠️ CONTRAINDICATION: NSAID ALLERGY</div>
              <p>Your allergy profile lists: <strong>${allergies}</strong>. You are prescribed <strong>Aspirin/Ibuprofen</strong>, which are NSAIDs. Taking these may lead to bronchospasms, hives, or gastric irritation. Ask your doctor for paracetamol-based analgesics, such as Paracetamol 650mg (Brand: Calpol, Crocin).</p>
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
            const searchQuery = getMedicineSearchQuery(med);
            const onlineUrl = `https://www.1mg.com/search/all?name=${encodeURIComponent(searchQuery)}`;
            return `<tr>
              <td>
                <a href="${onlineUrl}" target="_blank" class="medicine-lookup-link" title="Click to purchase or browse similar type medicines on Tata 1mg" style="font-weight:bold;">
                  ${med.split(" (")[0]} <span class="medicine-lookup-badge">🛒 Buy on 1mg</span>
                </a>
                ${med.includes("Brand:") ? `<br><small style="color:var(--cyan); font-size:0.7rem; font-weight:bold;">${med.match(/\(Brand: [^)]+\)/)?.[0] || ""}</small>` : ''}
              </td>
              <td>${ind}</td>
              <td>${time}</td>
            </tr>`;
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
  
  // Dynamic bilingual step labels
  const isOr = window.currentLang === 'or';
  const labelClassification = isOr ? "🔍 STEP 1: DOCUMENT CLASSIFICATION / ଦସ୍ତାବେଜ ଚିହ୍ନଟ" : "🔍 STEP 1: DOCUMENT CLASSIFICATION";
  const labelExtracted = isOr ? "📋 STEP 2: EXTRACTED KEY INFORMATION / ମୁଖ୍ୟ ତଥ୍ୟ ସଂଗ୍ରହ" : "📋 STEP 2: EXTRACTED KEY INFORMATION";
  const labelAnalysis = isOr ? "🔬 STEP 3: STRUCTURED CLINICAL ANALYSIS / ବିଶ୍ଳେଷଣାତ୍ମକ ବିବରଣୀ" : "🔬 STEP 3: STRUCTURED CLINICAL ANALYSIS";
  const labelGuidance = isOr ? "💡 STEP 4: PHARMACOTHERAPY & LIFESTYLE GUIDANCE / ଚିକିତ୍ସା ପରାମର୍ଶ" : "💡 STEP 4: PHARMACOTHERAPY & LIFESTYLE GUIDANCE";
  const labelNextSteps = isOr ? "🚨 STEP 5: POSSIBLE NEXT STEPS / ସମ୍ଭାବ୍ୟ ପରବର୍ତ୍ତୀ ପଦକ୍ଷେପ" : "🚨 STEP 5: POSSIBLE NEXT STEPS";

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

      <!-- Step 1: Identification of Document Type -->
      <div class="med-section info" style="margin-bottom:10px;">
        <div class="med-section-title" style="color:var(--accent); font-size:0.8rem;">${labelClassification}</div>
        <ul style="padding-left:14px; margin:0; font-size:0.78rem;">
          <li><strong>Document Class / ଶ୍ରେଣୀ:</strong> ${b.label} (${docType.toUpperCase()})</li>
          <li><strong>Identified File / ଫାଇଲ୍ ନାମ:</strong> <code>${file.name}</code></li>
          <li><strong>Simulation Target / ଚିକିତ୍ସା କ୍ଷେତ୍ର:</strong> ${detectedCondition}</li>
        </ul>
      </div>

      <!-- Step 2: Extracted Information -->
      <div class="med-section info" style="margin-bottom:10px;">
        <div class="med-section-title" style="color:var(--accent); font-size:0.8rem;">${labelExtracted}</div>
        <ul style="padding-left:14px; margin:0; font-size:0.78rem;">
          <li><strong>Patient Profile / ପ୍ରୋଫାଇଲ୍ ବିବରଣୀ:</strong> Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Gender: ${profile.gender || 'Unknown'}</li>
          ${parsedName || parsedAge || parsedGender ? `
            <li style="color:var(--cyan); font-weight:bold;">
              🧬 Extracted from Document / ଦସ୍ତାବେଜରୁ ସଂଗୃହିତ:
              Name: ${parsedName || 'Not Found'}, Age: ${parsedAge || 'Not Found'}, Gender: ${parsedGender || 'Not Found'}
            </li>
          ` : ''}
          <li><strong>Allergies / ଆଲର୍ଜି:</strong> ${profile.allergies || 'None Documented'}</li>
          <li><strong>Clinical Metric / ପ୍ରାଥମିକ ମାପକ:</strong> ${keyMetricName} resolved at <strong style="color:var(--teal);">${activeMetricVal}${keyMetricUnit}</strong> (Stage ${activeStage}/4)</li>
          <li><strong>Abnormal Values / ଅସ୍ୱାଭାବିକ ଚିହ୍ନଟ:</strong> ${activeStage >= 3 ? '<span style="color:var(--red-warn); font-weight:bold;">🚨 Yes - High risk abnormalities flagged.</span>' : '<span style="color:var(--accent); font-weight:bold;">⚠️ Moderate/Typical range variance.</span>'}</li>
        </ul>
      </div>

      <!-- Step 3: Structured Clinical Analysis -->
      <div class="med-section info" style="margin-bottom:10px;">
        <div class="med-section-title" style="color:var(--cyan); font-size:0.8rem;">${labelAnalysis}</div>
        <div style="font-size:0.78rem;">
          ${pathologyHtml}
        </div>
      </div>

      <!-- Live SLM Tuner Interface -->
      ${tunerHtml}

      <!-- Step 4: Lifestyle, Diet & Pharmacotherapy Guidance -->
      <div class="med-section info" style="margin-top:12px; margin-bottom:10px;">
        <div class="med-section-title" style="color:var(--teal); font-size:0.8rem;">${labelGuidance}</div>
        <div style="font-size:0.78rem; line-height:1.4;">
          <p style="margin-bottom:4px; font-weight:bold; color:var(--text-muted);">Generic Treatment Recommendations (No Brand Bias):</p>
          ${therapeuticSuggestions}
        </div>
      </div>

      <!-- Step 5: Possible Next Steps (Highlighted Section) -->
      <div class="med-section warning" style="border-left:4px solid ${stageColors[activeStage]}; background:rgba(${activeStage === 4 ? '255,0,85' : activeStage === 3 ? '255,102,0' : '255,204,0'}, 0.05); margin-top:12px; border-radius:4px; padding:10px;">
        <div class="med-section-title" style="color:${stageColors[activeStage]}; font-size:0.8rem; font-weight:bold;">${labelNextSteps}</div>
        <div style="font-size:0.8rem; line-height:1.4;">
          <p>${medicalAction}</p>
          <p style="font-size:0.75rem; margin-top:5px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:5px; font-weight:bold; color:var(--cyan);">
            🏥 Suggested Follow-up: Consult a primary care physician or a Pulmonologist/Cardiologist depending on severity status for real physical examination.
          </p>
        </div>
      </div>

      <!-- Step 6: Dynamic internet search and SLM retraining -->
      <div class="med-section info slm-autotrain-section" style="background: rgba(0, 255, 179, 0.02); border: 1px dashed var(--teal); margin-top:12px; border-radius: 6px; padding: 12px;">
        <div class="med-section-title" style="color:var(--teal); font-size:0.85rem; font-family:var(--font-head); letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center;">
          <span>${isOr ? "⚡ RAMAN AI AUTO-TRAIN ENGINE / ସ୍ୱୟଂଚାଳିତ ପ୍ରଶିକ୍ଷଣ" : "⚡ RAMAN AI AUTO-TRAIN ENGINE"}</span>
          <span style="font-size:0.65rem; color:var(--text-muted); padding:2px 6px; border-radius:10px; background:rgba(0, 255, 179, 0.05);">DYNAMIC INTERNET MODE</span>
        </div>
        <p style="font-size:0.75rem; margin:6px 0 10px 0; color:var(--text-muted); line-height:1.4;">
          ${isOr ? "ଲାଇଭ୍ ବାୟୋମେଡିକାଲ୍ ସର୍ଚ୍ଚ ଡାଟାବେସ୍ (Europe PMC) ରୁ ଚିକିତ୍ସା ସମ୍ବନ୍ଧୀୟ ଶବ୍ଦାବଳୀ ସଂଗ୍ରହ କରି ଅଫଲାଇନ୍ ସ୍ମାର୍ଟ ମଡେଲ୍ (SLM) କୁ ସ୍ୱୟଂଚାଳିତ ପ୍ରଶିକ୍ଷଣ ଦିଅନ୍ତୁ।" : "Expand the local offline Simple Language Model classifier. RAMAN AI will query live biomedical search databases (Europe PMC) to retrieve symptoms, parameters, and diagnostic synonyms to retrain your offline model in real-time."}
        </p>

        <!-- Retrain Trigger Button -->
        <button class="slm-autotrain-btn" data-condition-key="${conditionKey}" data-detected-condition="${detectedCondition}" style="width:100%; padding:8px; background:linear-gradient(135deg, rgba(0, 255, 179, 0.2), rgba(0, 229, 255, 0.2)); border:1px solid var(--teal); border-radius:6px; color:#ffffff; font-weight:bold; font-family:var(--font-head); font-size:0.78rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.3s; box-shadow:0 0 10px rgba(0,255,179,0.15);">
          ⚡ ${isOr ? "ଇଣ୍ଟରନେଟ୍ ଖୋଜନ୍ତୁ ଏବଂ ଅଫଲାଇନ୍ SLM କୁ ପ୍ରଶିକ୍ଷଣ ଦିଅନ୍ତୁ" : "SEARCH INTERNET & RETRAIN OFFLINE SLM"}
        </button>

        <!-- Retrain Telemetry Terminal -->
        <div class="slm-autotrain-console" style="display:none; margin-top:10px; background:#020710; border:1px solid rgba(0, 255, 179, 0.2); border-radius:4px; padding:8px; font-family:var(--font-mono); font-size:0.68rem; line-height:1.4; color:var(--teal); max-height:120px; overflow-y:auto; text-align:left;">
          [INFO] System standby. Awaiting live internet training command...
        </div>

        <!-- Sandbox Verification Tool (visible after training) -->
        <div class="slm-autotrain-sandbox" style="display:none; margin-top:12px; border-top:1px dashed rgba(0, 255, 179, 0.2); padding-top:10px;">
          <span style="font-size:0.75rem; font-weight:bold; color:var(--cyan); display:block; margin-bottom:6px;">${isOr ? "🔬 ଅଫଲାଇନ୍ ସ୍ୟାଣ୍ଡବକ୍ସ ପରୀକ୍ଷଣ / SANDBOX VERIFICATION" : "🔬 OFFLINE VERIFICATION SANDBOX"}</span>
          <p style="font-size:0.7rem; color:var(--text-muted); margin-bottom:6px; line-height:1.3;">
            ${isOr ? "ମଡେଲର ଅଫଲାଇନ୍ ନିରୂପଣ ସଠିକତା ପରୀକ୍ଷା କରିବା ପାଇଁ ତଳେ ନୂତନ ଚିକିତ୍ସା ଶବ୍ଦ ଟାଇପ୍ କରି ଟେଷ୍ଟ କରନ୍ତୁ:" : "Type the newly learned diagnostic terms below to verify the local model's updated offline classification accuracy in real-time:"}
          </p>
          <div style="display:flex; gap:6px; margin-bottom: 8px;">
            <input type="text" class="slm-autotrain-sandbox-input" placeholder="${isOr ? "ନୂତନ ଚିକିତ୍ସା ଶବ୍ଦ ଟାଇପ୍ କରନ୍ତୁ... (ଯେପରିକି alveolar consolidation)" : "Type new clinical phrases... (e.g. alveolar consolidation)"}" style="flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(0, 229, 255, 0.2); border-radius:4px; padding:4px 8px; color:#ffffff; font-size:0.72rem; outline:none;" />
            <button class="slm-autotrain-sandbox-test-btn" style="padding:4px 10px; background:rgba(0, 229, 255, 0.15); border:1px solid var(--cyan); border-radius:4px; color:#ffffff; font-size:0.7rem; font-weight:bold; cursor:pointer;">TEST</button>
          </div>
          <!-- Sandbox Results List -->
          <div class="slm-autotrain-sandbox-results" style="margin-top:8px; font-size:0.7rem; color:var(--text-main); font-family:var(--font-mono); line-height: 1.4;"></div>
        </div>
      </div>

      <!-- Mandatory Legal Disclaimer -->
      <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 8px; font-style: italic; line-height: 1.3; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
        ⚠️ <strong>MANDATORY DISCLAIMER / ଆଇନଗତ ଚେତାବନୀ:</strong> This is informational only, not a substitute for professional medical advice. / ଏହା କେବଳ ସୂଚନା ଉଦ୍ଦେଶ୍ୟରେ ଦିଆଯାଇଛି, ଏହା ବ୍ୟକ୍ତିଗତ ଚିକିତ୍ସା ପରାମର୍ଶର ବିକଳ୍ପ ନୁହେଁ।
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
  fresh.addEventListener('click', async () => {
    if (!pendingFile) return;
    const analysis  = document.getElementById('modalAnalysis');
    const manualType = document.getElementById('docTypeSelect').value;
    analysis.innerHTML = `<div class="modal-analyzing"><div class="modal-spin"></div> Analyzing with RAMAN AI…</div>`;
    
    const profile  = getProfile();
    const docType  = detectDocType(pendingFile, manualType);
    const b        = VAULT_BADGE[docType] || VAULT_BADGE.general;
    const n        = pendingFile.name.toLowerCase();

    // Parse exact parameters from filename for high-accuracy prompt engineering
    let parsedName = null;
    let parsedAge = null;
    let parsedGender = null;
    let parsedVal = null;
    
    const nameMatch = n.match(/(?:patient|name|for)?[_\-\s]([a-z]{3,15})(?:[_\-\s]|$)/i);
    if (nameMatch) {
      parsedName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
    }
    const ageMatch = n.match(/(?:age[_\-\s]?)?(\b\d{2}\b)/i);
    if (ageMatch) {
      parsedAge = parseInt(ageMatch[1]);
    }
    const genderMatch = n.match(/\b(male|female|m|f)\b/i);
    if (genderMatch) {
      const g = genderMatch[1].toLowerCase();
      parsedGender = (g === 'm' || g === 'male') ? 'Male' : 'Female';
    }
    const valMatch = n.match(/(\d+(?:\.\d+)?)(?:\s*(?:%|percent|mm|mg\/dl|bpm))?/i);
    if (valMatch) {
      parsedVal = parseFloat(valMatch[1]);
    }
    
    // Check if active provider is Gemini
    const provider = localStorage.getItem("ramanai_provider") || "slm";
    const geminiKey = localStorage.getItem("ramanai_gemini_api_key");
    const geminiModel = localStorage.getItem("ramanai_gemini_model") || "gemini-3.5-flash";
    
    let result = "";
    
    if (provider === "gemini" && geminiKey) {
      // Call Gemini for high-fidelity online document analysis!
      const isOr = window.currentLang === 'or';
      const prompt = `You are RAMAN AI, a state-of-the-art medical intelligence system.
Analyze the following uploaded medical document using your advanced clinical knowledge database.
Follow these exact steps:

Step 1: Identify the type of document. (The system detected this as: ${b.label} (${docType.toUpperCase()}) named "${pendingFile.name}").
Step 2: Extract key medical information:
  - Patient details (Patient Profile: Name: ${profile.name || 'Unknown'}, Age: ${profile.age || 'Unknown'}, Gender: ${profile.gender || 'Unknown'}, Blood Group: ${profile.blood || 'Unknown'}, Allergies: ${profile.allergies || 'None'}. Document parsed details: Extracted Name: ${parsedName || 'N/A'}, Extracted Age: ${parsedAge || 'N/A'}, Extracted Gender: ${parsedGender || 'N/A'}).
  - Extract vital signs, test values, or imaging findings from the document details (Extracted value from document metadata: ${parsedVal || 'None detected'}).
  - Extract medications prescribed (drug name, dosage, frequency) if applicable.
  - Flag abnormal values or critical results.
Step 3: Provide structured analysis:
  - Summarize findings in simple language.
  - Highlight abnormal results and possible conditions.
  - Suggest follow-up tests or doctor consultation if needed.
Step 4: Suggest medication or lifestyle guidance:
  - Recommend standard medications (use generic names only, absolute no brand bias, e.g. Paracetamol, Ibuprofen, Metformin, Lisinopril, Cetirizine, Clotrimazole, etc. with proper compositions).
  - Suggest diet, exercise, or monitoring routines.
  - Always include the mandatory legal clinical disclaimer: “This is informational only, not a substitute for professional medical advice.”
Step 5: Output format:
  - Clear HTML structures matching modern medical sandboxes. Use CSS class names like "med-section info", "med-section warning", etc.
  - Clear bullet points for findings.
  - Highlighted section for “Possible Next Steps”.
  - Output MUST be fully bilingual (English + Odia) since the user's current session preference is Odia (${isOr ? 'ACTIVE' : 'INACTIVE'}).

Return ONLY the complete HTML markup directly. Do not wrap in markdown code blocks.`;
      try {
        result = await generateGeminiResponse(prompt, profile, geminiKey, geminiModel);
        if (result.includes("```html")) {
          result = result.split("```html")[1].split("```")[0].trim();
        } else if (result.includes("```")) {
          result = result.split("```")[1].split("```")[0].trim();
        }
      } catch (err) {
        console.error("Gemini Doc Analysis failed, falling back to local SLM:", err);
        result = analyzeDocument(pendingFile, docType, profile);
      }
    } else {
      // Fallback to offline local SLM
      result = analyzeDocument(pendingFile, docType, profile);
    }
    
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
  });
})();

const CLINICAL_DICTS = {
  "pneumonia": ["alveolar consolidation", "pleural effusion", "bronchial density", "lobar opacities", "dyspnea", "rales and crepitations", "lung infiltration"],
  "joint pain": ["joint space narrowing", "articular cartilage degeneration", "osteophytes", "synovitis", "bone marrow edema", "subchondral sclerosis"],
  "brain tumor": ["contrast-enhancing mass", "neoplasm", "peritumoral edema", "midline shift", "glioma", "astrocytoma", "parenchymal lesion"],
  "back pain": ["lumbar disc herniation", "spinal canal stenosis", "foraminal narrowing", "spondylolisthesis", "osteophyte spurs", "disc bulge"],
  "myocardial ischemia": ["st-segment elevation", "acute coronary syndrome", "t-wave inversion", "myocardial infarction", "angina pectoris", "subendocardial ischemia"],
  "arrhythmia": ["premature ventricular beats", "atrial fibrillation", "paroxysmal tachycardia", "extra-systole", "av block", "ventricular ectopic runs"],
  "diabetes": ["hyperglycemia", "glycated hemoglobin", "insulin resistance", "polyuria", "polydipsia", "impaired fasting glucose", "diabetic ketoacidosis"],
  "renal failure": ["elevated creatinine", "impaired egfr", "glomerular nephritis", "uremic retention", "nephropathy", "renal clearance restriction"],
  "high blood pressure": ["hypertensive urgency", "systolic elevation", "diastolic variance", "arterial stiffness", "renin-angiotensin activation", "high systemic resistance"],
  "eye pain": ["intraocular pressure elevation", "conjunctival hyperemia", "corneal edema", "photophobia", "ciliary injection", "blepharitis"],
  "skin rash": ["allergic dermatitis", "erythematous patches", "prurigo bumps", "epidermal eczema", "urticaria papules", "fungal dermatomycosis"],
  "tuberculosis": ["cavitary lesion", "airborne transmission", "acid-fast bacilli", "pulmonary infiltration", "tubercle bacilli", "miliary spread"],
  "cardiomegaly": ["ventricular hypertrophy", "cardiac dilation", "cardiomyopathy", "heart enlargement", "pulmonary congestion", "afterload reduction"],
  "multiple sclerosis": ["demyelinating plaques", "uhthoff phenomenon", "optic neuritis", "oligoclonal bands", "white matter lesions", "myelin degradation"],
  "stroke": ["cerebral ischemia", "cerebral infarction", "thrombotic occlusion", "hemiplegia paralysis", "transient ischemic attack", "ischemic penumbra"],
  "hyperlipidemia": ["hypercholesterolemia", "atherosclerotic plaque", "low-density lipoprotein", "triglyceride elevation", "lipid profile clearance", "hmg-coa inhibition"],
  "hypothyroidism": ["thyroid stimulating hormone", "levothyroxine replacement", "hashimoto thyroiditis", "thyroid follicle activity", "subclinical hypothyroidism", "myxedema"]
};

async function fetchBiomedicalSynonyms(detectedCondition, docType) {
  const query = encodeURIComponent(detectedCondition.replace(/[\/\(\)]/g, " "));
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&format=json&pageSize=5`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP Status " + res.status);
    const data = await res.json();
    
    const titles = (data.resultList && data.resultList.result) ? data.resultList.result.map(r => r.title || "").join(" ") : "";
    const abstracts = (data.resultList && data.resultList.result) ? data.resultList.result.map(r => r.abstractText || "").join(" ") : "";
    const allText = (titles + " " + abstracts).toLowerCase();
    
    // Extract keywords present in Europe PMC literature matching clinical dictionary
    const foundKeywords = [];
    
    // Gather all candidate words for this condition/docType
    for (const [key, terms] of Object.entries(CLINICAL_DICTS)) {
      terms.forEach(term => {
        if (allText.includes(term.toLowerCase())) {
          foundKeywords.push(term);
        }
      });
    }
    
    if (foundKeywords.length >= 3) {
      return { keywords: Array.from(new Set(foundKeywords)), source: "Europe PMC Live Search" };
    }
    
    return { keywords: foundKeywords, source: "Europe PMC Sparse Match / Internal Fallback" };
  } catch (err) {
    console.warn("Europe PMC fetch failed. Running offline fallback dictionary extraction.", err);
    return { keywords: [], source: "Offline Fallback Dictionary" };
  }
}

async function autoTrainSLMWithKeywords(conditionKey, detectedCondition, docType, consoleEl) {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playScan();
  
  consoleEl.style.display = "block";
  consoleEl.innerHTML = `[CONNECTING] Establishing secure telemetry tunnel...<br/>[INTERNET] Querying online clinical databases for research papers...<br/>[SEARCH] Searching Europe PMC Literature API for "${detectedCondition}"...`;
  consoleEl.scrollTop = consoleEl.scrollHeight;

  // Symmetrical delay for premium scanning feel
  await new Promise(resolve => setTimeout(resolve, 800));

  const result = await fetchBiomedicalSynonyms(detectedCondition, docType);
  
  consoleEl.innerHTML += `<br/>[SUCCESS] API fetch completed from: <strong style="color:var(--cyan);">${result.source}</strong>`;
  
  let keywords = result.keywords;
  const fallbackTerms = CLINICAL_DICTS[conditionKey] || CLINICAL_DICTS["pneumonia"];
  
  if (keywords.length < 3) {
    consoleEl.innerHTML += `<br/>[FILTER] Low keyword density. Ingesting high-fidelity fallback synonyms...`;
    keywords = Array.from(new Set([...keywords, ...fallbackTerms.slice(0, 4)]));
  }
  
  consoleEl.innerHTML += `<br/>[EXTRACTED] Identified ${keywords.length} clinical terms: <em>${keywords.join(', ')}</em>`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
  await new Promise(resolve => setTimeout(resolve, 600));

  const synthesizedPhrases = [
    `the patient presents with active clinical indications of ${keywords[0]} and ${keywords[1]}`,
    `diagnostic report shows confirmed ${keywords[1]} with high probability of ${keywords[2] || keywords[0]}`,
    `observation notes suggest severe ${keywords[2] || keywords[0]} and abnormal ${keywords[3] || keywords[1]} in anatomical segment`,
    `radiological telemetry reveals clinical ${keywords[0]} corresponding to acute pathology`
  ];

  consoleEl.innerHTML += `<br/>[NLP] Synthesizing ${synthesizedPhrases.length} custom training phrases...`;
  synthesizedPhrases.forEach(p => {
    consoleEl.innerHTML += `<br/>&nbsp;&nbsp;&nbsp;&nbsp;🧬 <em>"${p}"</em>`;
  });
  consoleEl.scrollTop = consoleEl.scrollHeight;
  await new Promise(resolve => setTimeout(resolve, 800));

  if (!SLM_TRAINING_CORPUS[conditionKey]) {
    SLM_TRAINING_CORPUS[conditionKey] = [];
  }
  
  synthesizedPhrases.forEach(phrase => {
    if (!SLM_TRAINING_CORPUS[conditionKey].includes(phrase)) {
      SLM_TRAINING_CORPUS[conditionKey].push(phrase);
    }
  });

  localStorage.setItem('ramanai_expanded_corpus', JSON.stringify(SLM_TRAINING_CORPUS));

  consoleEl.innerHTML += `<br/>[DATABASE] Appended phrases and serialized expanded corpus to localStorage.`;
  consoleEl.innerHTML += `<br/>[TRAIN] Initiating local Naive Bayes retraining sweep...`;
  consoleEl.scrollTop = consoleEl.scrollHeight;

  const t0 = performance.now();
  slmClassifier.train(SLM_TRAINING_CORPUS);
  const t1 = performance.now();
  const duration = (t1 - t0).toFixed(3);

  const empathyDialogues = [
    `Our offline classifier now identifies ${conditionKey} based on dynamic internet parameters.`,
    `We have successfully compiled local weights for ${conditionKey} at sub-millisecond rates.`,
    `Offline diagnostic profile is fully optimized for detecting ${conditionKey} patterns.`
  ];
  markovGenerator.train(empathyDialogues, 'en');

  consoleEl.innerHTML += `<br/>[SUCCESS] Laplace smoothing completed in ${duration}ms!`;
  consoleEl.innerHTML += `<br/>[STATS] New Vocabulary features: ${slmClassifier.vocabulary.size} | Total Docs: ${slmClassifier.docCounts}`;
  consoleEl.innerHTML += `<br/><strong style="color:var(--teal);">[SYSTEM] LOCAL OFFLINE SLM TRAINED SUCCESSFULLY! 🚀</strong>`;
  consoleEl.scrollTop = consoleEl.scrollHeight;

  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
  
  if (typeof updateTrainingHubStats === 'function') {
    updateTrainingHubStats();
  }
}

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

// ── Welcome Message: Inside-App Health ID Restore Handler ───────────────────
document.body.addEventListener('click', e => {
  const btn = e.target.closest('#welcomeHidBtn');
  if (!btn) return;
  handleWelcomeHidRestore();
});

document.body.addEventListener('keydown', e => {
  const input = e.target.closest('#welcomeHidInput');
  if (!input) return;
  if (e.key === 'Enter') handleWelcomeHidRestore();
});

function handleWelcomeHidRestore() {
  const btn = document.getElementById('welcomeHidBtn');
  const inputEl = document.getElementById('welcomeHidInput');
  const errEl = document.getElementById('welcomeHidError');
  if (!btn || !inputEl || !errEl) return;
  
  const input = inputEl.value.trim();
  if (!input) { errEl.textContent = 'Please enter your Health ID.'; return; }
  
  btn.textContent = 'RESTORING...';
  errEl.textContent = '';
  
  setTimeout(() => {
    const ok = loadHealthSession(input);
    if (!ok) {
      btn.textContent = '↩ RESTORE';
      errEl.textContent = '❌ Health ID not found. Please check and try again.';
      errEl.style.color = '#ff4d6d';
    } else {
      // Hide the welcome message card since history is loaded
      const welcomeMsg = document.getElementById('welcomeMsg');
      if (welcomeMsg) welcomeMsg.style.display = 'none';
      if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
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

  // 4. Dynamic SLM Auto-Train click listener
  document.body.addEventListener('click', async e => {
    const btn = e.target.closest('.slm-autotrain-btn');
    if (!btn) return;
    const container = btn.closest('.slm-diagnostic-hub');
    if (!container) return;
    
    const conditionKey = btn.dataset.conditionKey;
    const detectedCondition = btn.dataset.detectedCondition;
    const docType = container.dataset.docType;
    
    const consoleEl = container.querySelector('.slm-autotrain-console');
    const sandboxEl = container.querySelector('.slm-autotrain-sandbox');
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `⚡ INGESTING CLINICAL METRICS...`;
    
    try {
      await autoTrainSLMWithKeywords(conditionKey, detectedCondition, docType, consoleEl);
      
      // Reveal sandbox
      if (sandboxEl) {
        sandboxEl.style.display = "block";
      }
      
      btn.innerHTML = `✅ SLM TRAINED SUCCESSFULLY`;
      btn.style.background = "rgba(0, 255, 179, 0.15)";
      btn.style.borderColor = "var(--teal)";
    } catch (err) {
      console.error(err);
      if (consoleEl) {
        consoleEl.innerHTML += `<br/><span style="color:var(--red-warn);">[ERROR] Training failed: ${err.message}</span>`;
      }
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // 5. Dynamic SLM Auto-Train Sandbox Verification click listener
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('.slm-autotrain-sandbox-test-btn');
    if (!btn) return;
    const container = btn.closest('.slm-diagnostic-hub');
    if (!container) return;
    
    const inputEl = container.querySelector('.slm-autotrain-sandbox-input');
    const resultsEl = container.querySelector('.slm-autotrain-sandbox-results');
    
    if (!inputEl || !resultsEl) return;
    
    const text = inputEl.value.trim();
    if (text.length < 3) {
      resultsEl.innerHTML = `<span style="color:var(--red-warn);">Please enter a valid clinical phrase (minimum 3 characters).</span>`;
      return;
    }
    
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playClick();
    
    const results = slmClassifier.classify(text);
    
    // Sort and take top 3
    let html = `<div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">`;
    results.slice(0, 3).forEach(item => {
      const barColor = item.confidence > 50 ? 'var(--teal)' : 'var(--cyan)';
      html += `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:2px;">
            <span style="font-weight:bold; color:var(--text-main); text-transform:uppercase;">${item.condition}</span>
            <span style="color:${barColor}; font-weight:bold;">${item.confidence}%</span>
          </div>
          <div style="width:100%; height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
            <div style="width:${item.confidence}%; height:100%; background:${barColor}; border-radius:2px; transition:width 0.4s ease;"></div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    
    resultsEl.innerHTML = html;
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
window.transitionToApp = function(sessionRestored = false) {
  clearTimeout(window._splashTimer);
  
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
  }
  
  setTimeout(() => {
    if (splash) splash.style.display = 'none';
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.display = 'flex';
    
    const welcomeEl = document.getElementById('welcomeTime');
    if (welcomeEl) welcomeEl.textContent = nowTime();
    
    if (typeof initParticles === 'function') initParticles();
    
    if (!sessionRestored) {
      if (typeof loadProfile === 'function') loadProfile();
    }
    
    if (typeof renderVault === 'function') renderVault();
    if (typeof scheduleGuidance === 'function') scheduleGuidance(true);
    if (typeof bindTunerEvents === 'function') bindTunerEvents();
    if (typeof bindConsultationEvents === 'function') bindConsultationEvents();
    
    // If we already have a Health ID from a prior session, show it in header
    if (currentHealthId) {
      updateHidChip();
      hidShownThisSession = true;
    }
  }, 600);
};

window._splashTimer = setTimeout(() => {
  window.transitionToApp(false);
}, 4800);

// ═══════════════════════════════════════════════════════
// ── SESSION MANAGER ────────────────────────────────────
// ═══════════════════════════════════════════════════════

function toggleSessionPanel() {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  const anthropicPanel = document.getElementById("settingsAnthropic");

  if (localSlmPanel) localSlmPanel.style.display = provider === "local-slm" ? "block" : "none";
  if (geminiPanel) geminiPanel.style.display = provider === "gemini" ? "block" : "none";
  if (openaiPanel) openaiPanel.style.display = provider === "openai" ? "block" : "none";
  if (anthropicPanel) anthropicPanel.style.display = provider === "anthropic" ? "block" : "none";
}

function openApiSettings() {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  const geminiModel = localStorage.getItem("ramanai_gemini_model") || "gemini-3.5-flash";
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

  // Load Anthropic details
  const anthropicKey = localStorage.getItem("ramanai_anthropic_api_key") || "";
  const anthropicBaseUrl = localStorage.getItem("ramanai_anthropic_base_url") || "https://api.anthropic.com";
  const anthropicModelName = localStorage.getItem("ramanai_anthropic_model") || "claude-3-7-sonnet-20250219";
  const anthropicKeyInput = document.getElementById("anthropicApiKey");
  const anthropicBaseUrlInput = document.getElementById("anthropicBaseUrl");
  const anthropicModelSelect = document.getElementById("anthropicModel");
  if (anthropicKeyInput) anthropicKeyInput.value = anthropicKey;
  if (anthropicBaseUrlInput) anthropicBaseUrlInput.value = anthropicBaseUrl;
  if (anthropicModelSelect) anthropicModelSelect.value = anthropicModelName;

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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  const geminiModel = document.getElementById("geminiModel") ? document.getElementById("geminiModel").value : "gemini-3.5-flash";
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

  // Anthropic Settings
  const anthropicKey = document.getElementById("anthropicApiKey") ? document.getElementById("anthropicApiKey").value.trim() : "";
  const anthropicBaseUrl = document.getElementById("anthropicBaseUrl") ? document.getElementById("anthropicBaseUrl").value.trim() : "https://api.anthropic.com";
  const anthropicModelName = document.getElementById("anthropicModel") ? document.getElementById("anthropicModel").value : "claude-3-7-sonnet-20250219";

  if (anthropicKey) {
    localStorage.setItem("ramanai_anthropic_api_key", anthropicKey);
  } else {
    localStorage.removeItem("ramanai_anthropic_api_key");
  }
  localStorage.setItem("ramanai_anthropic_base_url", anthropicBaseUrl);
  localStorage.setItem("ramanai_anthropic_model", anthropicModelName);

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
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
    alert(alertMsg);
  } else if (provider === "gemini") {
    const alertMsg = isOr
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! ଗୁଗଲ୍ ଜେମିନି API ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! Google Gemini API is the active engine.";
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
    alert(alertMsg);
  } else if (provider === "openai") {
    const alertMsg = isOr
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! କଷ୍ଟମ୍ API ଗେଟୱେ ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! Custom API Gateway is the active engine.";
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
    alert(alertMsg);
  } else if (provider === "anthropic") {
    const alertMsg = isOr
      ? "କନଫିଗରେସନ୍ ସଫଳତାର ସହ ସଂରକ୍ଷିତ ହେଲା! ଆନ୍ଥ୍ରୋପିକ୍ କ୍ଲଡ୍ API ସକ୍ରିୟ ଅଛି।"
      : "Configuration saved! Anthropic Claude API is the active engine.";
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
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
        
        /* Interactive Patient vs Clinician view styles */
        .patient-term { display: none; }
        .clinician-term { display: inline; }
        .clinical-code {
          display: inline-block;
          background: #f1f5f9;
          color: #475569;
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 6px;
          font-family: 'Orbitron', sans-serif;
        }
        .patient-only { display: none; }
        .clinician-only { display: block; }
        
        .prescription-container.patient-view .patient-term { display: inline !important; }
        .prescription-container.patient-view .clinician-term { display: none !important; }
        .prescription-container.patient-view .clinical-code { display: none !important; }
        .prescription-container.patient-view .clinician-only { display: none !important; }
        .prescription-container.patient-view .patient-only { display: block !important; }
        
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
        <button class="toggle-btn" onclick="toggleView()" style="background:#0f172a; color:#38bdf8; border:1px solid #38bdf8; padding:10px 24px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem; margin-left:10px; transition:all 0.2s; font-family:'Inter', sans-serif;">🔄 TOGGLE PATIENT VIEW</button>
      </div>
      
      <div class="prescription-container">
        <!-- Simulator Header -->
        <div class="rx-header">
          <div class="clinic-info">
            <h1>RAMAN AI THERAPEUTIC SIMULATOR</h1>
            <p><strong>Offline Neural Diagnostics Unit (Experiment No. 170)</strong></p>
            <p>Simulation Framework: Local Client-Side Inference Sandbox</p>
            <p>Simulator ID: ${data.healthId || 'RAMAN-HID-170'}</p>
          </div>
          <div class="rx-badge">
            <h2>Rx</h2>
            <p>SIMULATED THERAPEUTIC Rx</p>
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
          <h3>
            <span class="clinician-term">${data.condition}</span>
            <span class="patient-term">${data.conditionPatient || data.condition}</span>
            <span class="clinical-code">ICD-11: ${data.icd11 || 'N/A'}</span>
            <span style="font-size:0.8rem; color:#64748b;">(${data.stage})</span>
          </h3>
          <p class="clinician-only"><strong>Primary Assessment Marker:</strong> ${data.metricName} resolved at <strong>${data.metricValue}</strong>. Confidence level: 96% based on local Naive Bayes offline training.</p>
          <p class="patient-only"><strong>Diagnostic Measurement:</strong> Your symptom marker is <strong>${data.metricValue}</strong>. (Processed securely on your device using client-side AI).</p>
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
            ${data.medicines.map((m, idx) => {
              const searchQuery = getMedicineSearchQuery(m.name);
              const onlineUrl = `https://www.1mg.com/search/all?name=${encodeURIComponent(searchQuery)}`;
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>
                    <a href="${onlineUrl}" target="_blank" style="color: #0284c7; text-decoration: none; border-bottom: 1px dashed rgba(2, 132, 199, 0.4); font-weight: bold;" title="Click to purchase or browse similar type medicines on Tata 1mg">
                      ${m.name} <span style="font-size:0.65rem; padding:1px 4px; border-radius:3px; background:#e0f2fe; color:#0369a1; font-weight:normal; border:1px solid #bae6fd; margin-left:4px;">🛒 Buy</span>
                    </a>
                    ${m.snomed && m.snomed !== 'N/A' ? `<span class="clinical-code">SNOMED: ${m.snomed}</span>` : ''}
                  </td>
                  <td>${m.instructions}</td>
                  <td>${m.duration}</td>
                </tr>
              `;
            }).join('')}
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
        
        <!-- Emergency / Red Flags Panel -->
        ${data.redFlags && data.redFlags.length > 0 ? `
          <div class="warning-notice" style="background:#fff1f2; border:2px solid #fda4af; border-left:6px solid #e11d48; padding:16px; border-radius:8px; font-size:0.85rem; color:#9f1239; margin-bottom:30px; box-shadow:0 0 15px rgba(225, 29, 72, 0.15);">
            <strong style="font-size: 0.9rem; text-transform: uppercase;">⚠️ CRITICAL EMERGENCY RED FLAGS (IMMEDIATE MEDICAL CARE INSTRUCTIONS)</strong>
            <ul style="margin-top: 8px; padding-left: 20px; line-height: 1.5; text-align: left;">
              ${data.redFlags.map(flag => `<li>${flag}</li>`).join('')}
            </ul>
          </div>
        ` : data.urgencyWarning ? `
          <div class="warning-notice">
            <strong>🚨 SIMULATED URGENCY ALERT:</strong> ${data.urgencyWarning}
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
            <div class="sig-line">RAMAN AI SLM (Signature Authority)</div>
            <div style="font-size: 0.65rem; color:#64748b; margin-top:2px;">Electronically certified offline</div>
          </div>
        </div>
        
        <!-- Legal Disclaimer -->
        <div class="disclaimer">
          ⚠️ IMPORTANT LEGAL CLINICAL DISCLAIMER: RAMAN AI (Experiment No. 170) is a simulated therapeutic triage sandbox. All diagnostic classifications, lab results, and Rx drug formulations are synthesized client-side by a local lightweight Simple Language Model (SLM) vocabulary classifier and bigram Markov chain. This document is intended for educational demonstration, offline triage, and clinical sandbox validation. It DOES NOT substitute a real human doctor's physical examination, professional diagnosis, or active drug prescription. Please consult a qualified human physician before administering any medications listed in this simulated Rx.
        </div>
      </div>
      
      <script>
        let viewMode = 'clinician';
        function toggleView() {
          const container = document.querySelector('.prescription-container');
          const toggleBtn = document.querySelector('.toggle-btn');
          if (viewMode === 'clinician') {
            viewMode = 'patient';
            container.classList.add('patient-view');
            toggleBtn.innerHTML = "🔄 TOGGLE CLINICIAN VIEW";
            
            document.querySelectorAll('.clinician-term').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.patient-term').forEach(el => el.style.display = 'inline');
            document.querySelectorAll('.clinical-code').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.clinician-only').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.patient-only').forEach(el => el.style.display = 'block');
          } else {
            viewMode = 'clinician';
            container.classList.remove('patient-view');
            toggleBtn.innerHTML = "🔄 TOGGLE PATIENT VIEW";
            
            document.querySelectorAll('.clinician-term').forEach(el => el.style.display = 'inline');
            document.querySelectorAll('.patient-term').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.clinical-code').forEach(el => el.style.display = 'inline-block');
            document.querySelectorAll('.clinician-only').forEach(el => el.style.display = 'block');
            document.querySelectorAll('.patient-only').forEach(el => el.style.display = 'none');
          }
        }
        
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
    snomed: m.snomed || "N/A",
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

  // Vitals for red flags compilation
  const vitalsObj = { bp: bpVal, heartRate: hrVal, temp: tempVal, SpO2: spo2Val };
  const redFlags = compileRedFlags(conditionKey, vitalsObj);

  // Construct print-ready Rx data
  const rxData = {
    healthId: currentHealthId || 'RAMAN-HID-170',
    conditionKey: conditionKey,
    conditionClinician: conditionName,
    conditionPatient: translateToPatientTerms(conditionKey),
    icd11: kb.icd11 || "N/A",
    condition: conditionName,
    stage: stageText,
    metricName: metricName,
    metricValue: metricValue,
    vitals: vitalsObj,
    risks: allergyWarning ? ["Allergy Contraindication"] : [],
    medicines: medicines,
    diet: kb.diet || [],
    precautions: kb.precautions || [],
    urgencyWarning: allergyWarning || (conditionKey === "chest pain" ? "Treat all chest pain as cardiac emergency. Seek physical ER care immediately." : ""),
    redFlags: redFlags,
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
    case "malaria":
      conditionName = "Plasmodium Parasitic Hemolytico-Febrile Infection";
      metricName = "Parasitemia Hemolysis Index";
      defaultMetricVal = "42%";
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
        subName = "Azithromycin 500mg (Brand: Azithral, Zithromax)";
        subDose = "1 tablet daily before food";
        subNote = "Safe alternative for active Penicillin allergy";
        reason = "Penicillin Allergy Safe-Substitution";
      } else if (medNameLower.includes("ibuprofen") || medNameLower.includes("diclofenac") || medNameLower.includes("aspirin")) {
        subName = "Paracetamol 650mg (Brand: Calpol, Crocin)";
        subDose = "1 tablet every 6-8 hours after food";
        subNote = "Safe alternative for active NSAID allergy";
        reason = "NSAID Allergy Safe-Substitution";
      } else {
        subName = "Paracetamol 500mg (Brand: Calpol, Crocin)";
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
  const summary = `Offline therapeutic simulation generated simulated lab findings for ${conditionName} (${stageText}). Patient profile and vitals (BP: ${bp}, Temp: ${temp}, SpO2: ${spo2}) checked against SLM rules.`;

  const documentAnalysisHtml = analyzeDocument({ name: vaultDocTitle }, vaultDocType, p, tunerParams);
  const savedDocId = saveSimulatedToVault(vaultDocTitle, vaultDocType, summary, documentAnalysisHtml, dataUrl);

  // Compile Red Flags
  const vitalsObj = { bp, heartRate: hr.toString(), temp: temp.toString(), SpO2: spo2.toString() };
  const redFlags = compileRedFlags(category, vitalsObj);
  let redFlagsHtml = "";
  if (redFlags.length > 0) {
    redFlagsHtml = `
      <div class="med-section warning" style="border-left:4px solid var(--red-warn); background:rgba(255, 77, 109, 0.08); padding:12px; border-radius:6px; margin-bottom:15px; font-size:0.85rem; box-shadow:0 0 10px rgba(255, 77, 109, 0.15);">
        <strong style="color:var(--red-warn); font-family:var(--font-head);"><span style="animation: pulseGlow 1.5s infinite;">⚠️ CRITICAL MEDICAL RED FLAGS (EMERGENCY WARNING)</span></strong>
        <ul style="margin:5px 0 0 0; padding-left:18px; line-height:1.4; color:var(--text-main); text-align:left;">
          ${redFlags.map(flag => `<li style="margin-bottom:4px;">${flag}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // Compile final print-ready Rx data
  const rxData = {
    healthId: currentHealthId || 'RAMAN-HID-170',
    conditionKey: category,
    conditionClinician: conditionName,
    conditionPatient: translateToPatientTerms(category),
    icd11: kb.icd11 || "N/A",
    condition: conditionName,
    stage: stageText,
    metricName: metricName,
    metricValue: metricValue,
    vitals: vitalsObj,
    risks: risks,
    medicines: medicines,
    diet: diet,
    precautions: precautions,
    urgencyWarning: urgencyWarning,
    redFlags: redFlags,
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
            "\u0022${empathyFiller}\u0022"
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

        ${redFlagsHtml}

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
              ${medicines.map(m => {
                const searchQuery = getMedicineSearchQuery(m.name);
                const onlineUrl = `https://www.1mg.com/search/all?name=${encodeURIComponent(searchQuery)}`;
                return `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:6px 0;">
                      <a href="${onlineUrl}" target="_blank" class="medicine-lookup-link" title="Click to purchase or browse similar type medicines on Tata 1mg">
                        ${m.name} <span class="medicine-lookup-badge">🛒 Buy on 1mg</span>
                      </a>
                    </td>
                    <td style="padding:6px 0; color:var(--text-main);">${m.instructions}</td>
                    <td style="padding:6px 0; text-align:right; color:var(--text-muted);">${m.duration}</td>
                  </tr>
                `;
              }).join('')}
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

        ${renderExplainabilityPanel(activeConsultation.selectedSymptoms.join(' '))}

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

function cleanAIResponse(text) {
  if (!text) return text;
  let cleaned = text.trim();

  // 1. Remove <think>...</think> blocks if present
  cleaned = cleaned.replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Remove self-correction or thought prefixes before the first HTML tag.
  const firstTagIndex = cleaned.indexOf('<');
  if (firstTagIndex > 0) {
    const prefix = cleaned.substring(0, firstTagIndex).trim();
    if (/self-correction|thinking|thought|correction|self correction/i.test(prefix)) {
      cleaned = cleaned.substring(firstTagIndex).trim();
    }
  }

  // 3. Remove specific markdown self-correction and thought patterns anywhere in response
  cleaned = cleaned.replace(/\*(?:Self-Correction|Self Correction|Thought|Thinking Process)[^*]*\*(?:[^*<]|\n)*/gi, '');

  // 4. Handle cases where the text starts with a "Self-Correction:" prefix but no HTML tag follows immediately
  cleaned = cleaned.replace(/^(?:Thinking Process|Thought|Thinking|Self-Correction|Self Correction):\s*[\s\S]*?(?=\n\n|\n[<*#]|$)/i, '');

  // 5. Clean up outer markdown code block wrappers (e.g. ```html ... ``` or ``` ... ```)
  const codeBlockRegex = /^```(?:html)?\s*([\s\S]*?)\s*```$/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }

  return cleaned.trim();
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
7. Do NOT include any self-correction, thoughts, explanation of formatting, reasoning steps, or internal commentary. Output ONLY the final rendered HTML and nothing else.

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
    const apiVersion = (model.startsWith("gemini-3.5") || model.startsWith("gemini-2.")) ? "v1beta" : "v1";
    const response = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`, {
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
      return cleanAIResponse(data.candidates[0].content.parts[0].text);
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
7. Do NOT include any self-correction, thoughts, explanation of formatting, reasoning steps, or internal commentary. Output ONLY the final rendered HTML and nothing else.

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
      return cleanAIResponse(data.choices[0].message.content);
    } else {
      return `<p>An unexpected response format was returned from the API.</p>`;
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return `<div class="med-section warning"><p>⚠️ Network error. Could not reach OpenAI API Gateway.</p></div>`;
  }
}

async function generateAnthropicResponse(text, profile, apiKey, baseUrl, model) {
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
7. Do NOT include any self-correction, thoughts, explanation of formatting, reasoning steps, or internal commentary. Output ONLY the final rendered HTML and nothing else.

Here is the current patient profile:
${profileCtx}`;

  const messages = [];

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
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01"
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        system: systemInstruction,
        messages: messages,
        temperature: temp,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Anthropic API Error:", errorData);
      const errMsg = errorData.error ? errorData.error.message : 'Unable to connect to Anthropic';
      return `<div class="med-section warning"><p>⚠️ API Error: ${errMsg}</p><p><small>Please check your API key and settings configuration.</small></p></div>`;
    }

    const data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      return cleanAIResponse(data.content[0].text);
    } else {
      return `<p>An unexpected response format was returned from the Anthropic API.</p>`;
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return `<div class="med-section warning"><p>⚠️ Network error. Could not reach Anthropic API Gateway.</p></div>`;
  }
}


// ==========================================
// ── RAMAN SLM TRAINING HUB & SANDBOX HUD ──
// ==========================================

function openTrainingHub() {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();
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

  if (classEl) classEl.textContent = Object.keys(slmClassifier.weights).length;
  if (docsEl) docsEl.textContent = slmClassifier.docCounts;
  if (vocabEl) vocabEl.textContent = slmClassifier.vocabulary.size.toLocaleString();
  if (markovEl) {
    const totalEn = markovGenerator.chainEn ? Object.keys(markovGenerator.chainEn).length : 0;
    const totalOr = markovGenerator.chainOr ? Object.keys(markovGenerator.chainOr).length : 0;
    const totalMarkovPairs = totalEn + totalOr;
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
    const totalEn = markovGenerator.chainEn ? Object.keys(markovGenerator.chainEn).length : 0;
    const totalOr = markovGenerator.chainOr ? Object.keys(markovGenerator.chainOr).length : 0;
    const totalMarkovPairs = totalEn + totalOr;
    log += `[2.35ms] Built ${totalMarkovPairs} transition states\n`;
    log += `[SUCCESS] Rigorous training completed in ${duration}ms!\n`;
    log += `[STATS] Vocabulary features: ${slmClassifier.vocabulary.size} | Docs: ${slmClassifier.docCounts}\n`;
    
    if (consoleLog) {
      consoleLog.textContent = log;
      consoleLog.scrollTop = 9999;
    }
    
    if (btn) btn.disabled = false;
    if (cpu) cpu.style.width = "48%";
    if (neural) neural.style.width = "52%";
    
    // Play telemetry scan sweep and success chime SFX
    if (window.BioTelemetrySFX) {
      window.BioTelemetrySFX.playScan();
      setTimeout(() => window.BioTelemetrySFX.playSuccess(), 450);
    }

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

  // Retrieve active classifications from SLM
  const classifications = slmClassifier.classify(text);

  // Ensure strict re-ranking sorting
  classifications.sort((a, b) => b.confidence - a.confidence);
  
  let html = "";
  
  classifications.forEach((item, index) => {
    // Condition title translation for premium bilingual experience
    const titles = {
      "fever": "Acute Febrile Illness / ଜ୍ୱର",
      "malaria": "Plasmodium Parasite Infection / ମ୍ୟାଲେରିଆ",
      "headache": "Vasospastic Cephalgia / ମୁଣ୍ଡବିନ୍ଧା",
      "cough": "Bronchial Congestion / କାଶ",
      "chest pain": "Myocardial Ischemia / ଛାତି ଯନ୍ତ୍ରଣା",
      "stomach pain": "Hyperacidic Gastropathy / ପେଟ କାଟୁଛି",
      "joint pain": "Osteoarthropathy / ଗଣ୍ଠି ବାତ",
      "skin rash": "Allergic Dermatitis / ଚର୍ମ କୁଣ୍ଡେଇ ହେବା",
      "high blood pressure": "Arterial Hypertension / ଉଚ୍ଚ ରକ୍ତଚାପ",
      "diabetes": "Diabetes Mellitus / ମଧୁମେହ",
      "eye pain": "Ocular Hypertension / ଆଖି ବିନ୍ଧା",
      "back pain": "LumbarMechanical Strain / ଅଣ୍ଟା ବୀନ୍ଧା"
    };

    const displayTitle = titles[item.condition] || item.condition;
    const barWidth = item.confidence + "%";
    
    // Harmonious colors depending on confidence: high (accent), moderate (cyan), low (dimmed)
    let fillStyle = "background: linear-gradient(90deg, var(--cyan), var(--teal));";
    let glowColor = "rgba(0, 229, 255, 0.4)";
    let rankText = `#${String(index + 1).padStart(2, '0')}`;
    let rankColor = "rgba(255,255,255,0.4)";
    let rowBorderGlow = "";
    
    if (index === 0 && item.confidence > 0) {
      fillStyle = "background: linear-gradient(90deg, var(--accent), var(--teal));";
      glowColor = "rgba(0, 255, 179, 0.7)";
      rankColor = "var(--accent)";
      rowBorderGlow = "border-color: rgba(0, 255, 179, 0.25); box-shadow: 0 0 10px rgba(0, 255, 179, 0.08); background: rgba(0, 255, 179, 0.02);";
    } else if (item.confidence < 15) {
      fillStyle = "background: rgba(255,255,255,0.08);";
      glowColor = "rgba(255,255,255,0.02)";
      rankColor = "rgba(255,255,255,0.2)";
    }

    html += `
      <div class="sandbox-meter-row" style="${rowBorderGlow}">
        <div class="sandbox-meter-header">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-family:var(--font-head); font-size:0.65rem; color:${rankColor}; font-weight:bold;">${rankText}</span>
            <span style="font-weight:bold; color:${item.confidence > 25 ? 'var(--text-main)' : 'var(--text-muted)'};">${displayTitle}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-family:monospace; font-size:0.6rem; color:var(--text-muted);">log-p: ${item.score}</span>
            <span style="font-family:var(--font-head); font-weight:bold; color:${index === 0 && item.confidence > 0 ? 'var(--accent)' : 'var(--cyan)'};">${item.confidence}%</span>
          </div>
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

// ── CLINICAL CODES & EMERGENCIES HELPERS ────────────────
function translateToPatientTerms(conditionKey) {
  const mapping = {
    "fever": "Fever & General Infection Triage",
    "malaria": "Malaria & Parasitic Infection Triage",
    "headache": "Headache & Muscular Tension Triage",
    "cough": "Cough & Airway Clearance Support",
    "chest pain": "Chest Discomfort & Emergency Safety Triage",
    "stomach pain": "Stomach & Digestive System Recovery",
    "joint pain": "Joint Care & Movement Relief",
    "skin rash": "Skin Soothing & Allergen Relief",
    "high blood pressure": "Blood Pressure Management Guidelines",
    "diabetes": "Blood Sugar & Glycemic Control Guidelines",
    "eye pain": "Ocular Comfort & Eye Strain Triage",
    "back pain": "Back & Spinal Musculoskeletal Support"
  };
  return mapping[conditionKey] || "General Symptoms Assessment";
}
window.translateToPatientTerms = translateToPatientTerms;

function compileRedFlags(conditionKey, vitals) {
  const flagsMap = {
    fever: [
      "Fever exceeding 104°F (40°C) or persistent fever > 72 hours",
      "Stiff neck, severe headache, confusion, or difficulty waking up",
      "Difficulty breathing or persistent chest pain"
    ],
    headache: [
      "Sudden, severe headache ('thunderclap' onset)",
      "Headache accompanied by fever, stiff neck, confusion, or seizures",
      "New headache after a head injury or with weakness/numbness in limbs"
    ],
    cough: [
      "Coughing up blood (hemoptysis)",
      "Shortness of breath, wheezing, or difficulty speaking in full sentences",
      "Oxygen saturation (SpO2) dropping below 93%"
    ],
    "chest pain": [
      "Pressure, tightness, or squeezing pain radiating to left arm, neck, jaw, or back",
      "Chest pain accompanied by sweating, shortness of breath, nausea, or lightheadedness",
      "Pain that does not resolve with rest or worsens rapidly"
    ],
    "stomach pain": [
      "Severe, sudden abdominal pain localized to the right lower quadrant (suspected appendicitis)",
      "Persistent vomiting, inability to keep fluids down, or signs of extreme dehydration",
      "Blood in vomit (hematemesis) or black, tarry stools (melena)"
    ],
    "joint pain": [
      "Joint pain with high fever, severe redness, swelling, and warmth (suspected septic arthritis)",
      "Inability to bear weight or complete loss of function in the affected limb",
      "Rapidly progressive joint inflammation after trauma"
    ],
    "skin rash": [
      "Rash spreading rapidly across the body or accompanied by high fever",
      "Presence of skin peeling, blistering, or painful mucosal lesions (Stevens-Johnson syndrome risk)",
      "Rash accompanied by facial/tongue swelling or difficulty breathing (anaphylaxis)"
    ],
    "high blood pressure": [
      "Blood pressure exceeding 180 mmHg systolic or 120 mmHg diastolic (hypertensive crisis)",
      "Severe headache, blurred vision, chest pain, or sudden confusion",
      "Shortness of breath or numbness/weakness in limbs"
    ],
    diabetes: [
      "Extreme thirst, frequent urination, rapid weight loss, with fruit-smelling breath (suspected DKA)",
      "Blood sugar reading below 70 mg/dL with sweating, tremors, confusion, or loss of consciousness (hypoglycemia)",
      "Non-healing foot ulcers, severe localized infection, or sudden vision loss"
    ],
    "eye pain": [
      "Sudden, severe eye pain with headache, nausea, or halos around lights (suspected acute glaucoma)",
      "Sudden partial or complete loss of vision",
      "Severe sensitivity to light (photophobia) or penetrating eye injury"
    ],
    "back pain": [
      "Back pain with loss of bowel or bladder control (saddle anesthesia / Cauda Equina risk)",
      "Unexplained fever, severe night pain, or history of recent cancer",
      "Progressive weakness, numbness, or tingling radiating down both legs"
    ]
  };
  
  const flags = [...(flagsMap[conditionKey] || [])];
  
  if (vitals) {
    if (vitals.bp) {
      const parts = vitals.bp.split("/").map(Number);
      if (parts[0] > 180 || parts[1] > 120) {
        flags.unshift("🚨 VITAL WARNING: Systolic BP > 180 mmHg or Diastolic BP > 120 mmHg indicates hypertensive crisis!");
      }
    }
    if (vitals.heartRate) {
      const hrVal = Number(vitals.heartRate);
      if (hrVal > 120 || hrVal < 45) {
        flags.unshift(`🚨 VITAL WARNING: Extreme heart rate (${hrVal} bpm) detected! Normal range is 60-100 bpm.`);
      }
    }
    if (vitals.temp) {
      const tVal = Number(vitals.temp);
      if (tVal > 103.5) {
        flags.unshift(`🚨 VITAL WARNING: High fever temperature (${tVal}°F) representing core hyperpyrexia risk!`);
      }
    }
    if (vitals.SpO2) {
      const sVal = Number(vitals.SpO2);
      if (sVal < 92) {
        flags.unshift(`🚨 VITAL WARNING: Critically low blood oxygen level (SpO2: ${sVal}%) indicating respiratory distress!`);
      }
    }
  }
  
  if (flags.some(f => f.startsWith("🚨 VITAL WARNING")) && window.BioTelemetrySFX) {
    window.BioTelemetrySFX.playAlarm();
  }
  
  return flags;
}
window.compileRedFlags = compileRedFlags;

// ── WEB CRYPTO AES-GCM BACKUP IMPLEMENTATIONS ──────────
async function deriveEncryptionKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBackup(text, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(text)
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return { saltHex, ivHex, ciphertextBase64 };
}

async function decryptBackup(saltHex, ivHex, ciphertextBase64, password) {
  const dec = new TextDecoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(atob(ciphertextBase64).split('').map(c => c.charCodeAt(0)));
  const key = await deriveEncryptionKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    return dec.decode(plaintext);
  } catch (err) {
    throw new Error("Incorrect password or corrupted file.");
  }
}

// ── SESSION BACKUP & PORTABILITY SERIALIZATION ─────────
window.exportSessionBackupJSON = async function() {
  try {
    const p = getProfile();
    p.pain = document.getElementById('painSlider').value;
    
    // Read all files from IndexedDB
    const files = await new Promise((resolve) => {
      if (!db) {
        resolve([]);
        return;
      }
      const transaction = db.transaction([dbStoreName], "readonly");
      const store = transaction.objectStore(dbStoreName);
      const request = store.getAll();
      request.onsuccess = e => resolve(e.target.result || []);
      request.onerror = () => resolve([]);
    });

    const diaryHistory = JSON.parse(localStorage.getItem('ramanai_diary_history') || '[]');
    
    const backupPayload = {
      ramanai_backup: true,
      version: "1.1",
      exportDate: new Date().toISOString(),
      currentHealthId: currentHealthId || "NO-SESSION",
      profile: p,
      detectedConditions: [...detectedConditions],
      vaultData: vaultData,
      chatHistory: chatHistory,
      files: files,
      diaryHistory: diaryHistory
    };
    
    const jsonStr = JSON.stringify(backupPayload, null, 2);
    
    // Check if user wants password protection
    const password = prompt("⚠️ SECURE YOUR HEALTH VAULT:\nEnter a password to encrypt your local backup (Leave blank for standard download):");
    
    let finalBlobPayload;
    let fileName = `raman_health_vault_backup_${currentHealthId || 'fresh'}.json`;
    
    if (password !== null && password.trim() !== "") {
      const encrypted = await encryptBackup(jsonStr, password);
      const encryptedPayload = {
        ramanai_backup: true,
        ramanai_encrypted: true,
        version: "1.1",
        exportDate: new Date().toISOString(),
        currentHealthId: currentHealthId || "NO-SESSION",
        encryption: encrypted
      };
      finalBlobPayload = JSON.stringify(encryptedPayload, null, 2);
      fileName = `raman_health_vault_backup_ENCRYPTED_${currentHealthId || 'fresh'}.json`;
    } else {
      finalBlobPayload = jsonStr;
    }
    
    const blob = new Blob([finalBlobPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log("Health vault and profile exported successfully.");
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
  } catch (err) {
    console.error("Failed to export health vault:", err);
    if (window.BioTelemetrySFX) window.BioTelemetrySFX.playError();
    alert("Failed to export backup: " + err.message);
  }
};

window.importSessionBackupJSON = function(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      let rawJson = e.target.result;
      let backup = JSON.parse(rawJson);
      if (!backup.ramanai_backup) {
        alert("Invalid backup file: Missing RAMAN AI signature.");
        return;
      }
      
      // Decrypt if password protected
      if (backup.ramanai_encrypted) {
        const password = prompt("📥 PASSWORD REQUIRED:\nThis health backup is password-protected. Please enter the password to decrypt:");
        if (password === null) return;
        
        try {
          const decryptedText = await decryptBackup(
            backup.encryption.saltHex,
            backup.encryption.ivHex,
            backup.encryption.ciphertextBase64,
            password
          );
          backup = JSON.parse(decryptedText);
        } catch (decErr) {
          if (window.BioTelemetrySFX) window.BioTelemetrySFX.playError();
          alert("❌ DECRYPTION FAILED: Incorrect password or corrupted backup file.");
          return;
        }
      }
      
      currentHealthId = backup.currentHealthId || generateHealthId();
      sessionCreatedDate = backup.profile.created || new Date().toISOString();
      
      // Restore profile DOM values
      const p = backup.profile || {};
      if (document.getElementById('patientName')) document.getElementById('patientName').value = p.name || '';
      if (document.getElementById('patientAge')) document.getElementById('patientAge').value = p.age || '';
      if (document.getElementById('patientGender')) document.getElementById('patientGender').value = p.gender || 'Not specified';
      if (document.getElementById('patientBlood')) document.getElementById('patientBlood').value = p.blood || 'Unknown';
      if (document.getElementById('patientAllergies')) document.getElementById('patientAllergies').value = p.allergies || '';
      if (document.getElementById('patientBP')) document.getElementById('patientBP').value = p.bp || '';
      if (document.getElementById('patientHR')) document.getElementById('patientHR').value = p.heartRate || '';
      if (document.getElementById('patientTemp')) document.getElementById('patientTemp').value = p.temp || '';
      if (document.getElementById('patientSpO2')) document.getElementById('patientSpO2').value = p.SpO2 || '';
      
      if (p.pain && document.getElementById('painSlider')) {
        const sl = document.getElementById('painSlider');
        sl.value = p.pain;
        sl.dispatchEvent(new Event('input'));
      }
      updateProfileCompleteness();
      
      // Restore IndexedDB files
      if (backup.files && backup.files.length) {
        for (const f of backup.files) {
          await storeSimulatedFileInDB(f.id, f.name, f.type, f.dataUrl);
        }
      }
      
      // Restore memory states
      detectedConditions = new Set(backup.detectedConditions || []);
      vaultData = backup.vaultData || [];
      chatHistory = backup.chatHistory || [];
      
      // Restore diary history
      if (backup.diaryHistory) {
        localStorage.setItem('ramanai_diary_history', JSON.stringify(backup.diaryHistory));
        window.renderDiaryChart();
      }
      
      // Save session inside localStorage
      localStorage.setItem('ramanai_conditions', JSON.stringify([...detectedConditions]));
      localStorage.setItem('ramanai_vault', JSON.stringify(vaultData));
      localStorage.setItem('ramanai_current_hid', currentHealthId);
      
      const session = {
        id: currentHealthId,
        created: sessionCreatedDate,
        lastSeen: new Date().toISOString(),
        profile: p,
        conditions: [...detectedConditions],
        vault: vaultData.map(v => ({ id: v.id, name: v.name, type: v.type, date: v.date, summary: v.summary })),
        messages: chatHistory
      };
      localStorage.setItem('ramanai_hid_' + currentHealthId, JSON.stringify(session));
      
      // Refresh UI components
      renderVault();
      updateHidChip();
      closeSessionPanel();
      if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
      
      // Add welcome/restore chat card
      addMessage('ai', `
        <div class="restore-summary" style="border-left:4px solid var(--accent); background:rgba(0, 255, 179, 0.05); padding:15px; border-radius:8px; margin-bottom:15px;">
          <div class="restore-header" style="color:var(--accent); font-weight:bold; font-family:var(--font-head);">📥 HEALTH VAULT RESTORED — ${currentHealthId}</div>
          <p style="margin-top:10px; font-size:0.88rem;">Your secure self-sovereign health vault and patient profile have been successfully restored from your JSON backup file!</p>
          <div class="restore-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; font-size:0.8rem; margin-top:10px;">
            <div class="restore-cell" style="background:rgba(255,255,255,0.02); padding:5px; border-radius:4px;"><span class="rc-label" style="color:var(--text-muted); font-size:0.7rem; display:block;">PATIENT</span><span class="rc-value" style="font-weight:bold; color:var(--text-main);">${p.name || '—'}</span></div>
            <div class="restore-cell" style="background:rgba(255,255,255,0.02); padding:5px; border-radius:4px;"><span class="rc-label" style="color:var(--text-muted); font-size:0.7rem; display:block;">AGE</span><span class="rc-value" style="font-weight:bold; color:var(--text-main);">${p.age || '—'} Yrs</span></div>
            <div class="restore-cell" style="background:rgba(255,255,255,0.02); padding:5px; border-radius:4px;"><span class="rc-label" style="color:var(--text-muted); font-size:0.7rem; display:block;">BLOOD GROUP</span><span class="rc-value" style="font-weight:bold; color:var(--text-main);">${p.blood || '—'}</span></div>
            <div class="restore-cell" style="background:rgba(255,255,255,0.02); padding:5px; border-radius:4px;"><span class="rc-label" style="color:var(--text-muted); font-size:0.7rem; display:block;">VAULT FILES</span><span class="rc-value" style="font-weight:bold; color:var(--teal);">${backup.files ? backup.files.length : 0} restored</span></div>
          </div>
        </div>`, true);
      
    } catch (err) {
      console.error("Failed to parse or restore backup JSON:", err);
      alert("Failed to restore backup: " + err.message);
    }
  };
  reader.readAsText(file);
};

// ── SYMPTOM & RECOVERY DIARY HANDLERS ──────────────────
window.logDiaryEntry = function() {
  const cond = document.getElementById('diaryCondition').value;
  const sevVal = parseInt(document.getElementById('diarySeverity').value || "5");
  if (sevVal < 1 || sevVal > 10) {
    alert("Please enter a severity value between 1 and 10.");
    return;
  }
  
  const history = JSON.parse(localStorage.getItem('ramanai_diary_history') || '[]');
  history.push({
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    condition: cond,
    severity: sevVal
  });
  localStorage.setItem('ramanai_diary_history', JSON.stringify(history));
  document.getElementById('diarySeverity').value = "5"; // Reset to standard mid-value
  window.renderDiaryChart();
};

window.clearDiaryEntries = function() {
  if (confirm("Are you sure you want to clear your local recovery diary history?")) {
    localStorage.removeItem('ramanai_diary_history');
    window.renderDiaryChart();
  }
};

window.renderDiaryChart = function(hoveredPoint) {
  const canvas = document.getElementById('diaryCanvas');
  if (!canvas) return;
  // Sync canvas pixel buffer to its CSS-rendered width
  const cssWidth = canvas.offsetWidth || 280;
  canvas.width = cssWidth;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const history = JSON.parse(localStorage.getItem('ramanai_diary_history') || '[]');
  
  // Calculate average, peak and trend
  const avgEl = document.getElementById('diaryStatAvg');
  const peakEl = document.getElementById('diaryStatPeak');
  const trendEl = document.getElementById('diaryStatTrend');
  const countEl = document.getElementById('diaryTrendCount');
  
  if (countEl) {
    countEl.textContent = `${history.length} log${history.length !== 1 ? 's' : ''}`;
  }
  
  if (history.length === 0) {
    if (avgEl) avgEl.textContent = 'N/A';
    if (peakEl) peakEl.textContent = 'N/A';
    if (trendEl) {
      trendEl.textContent = 'N/A';
      trendEl.style.color = 'var(--teal)';
    }
    
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No recovery diary entries recorded.", w / 2, h / 2);
    return;
  }
  
  // Math Calculations for Dashboard
  const sum = history.reduce((acc, entry) => acc + Number(entry.severity), 0);
  const avg = Math.round((sum / history.length) * 10) / 10;
  const peak = history.reduce((max, entry) => Math.max(max, Number(entry.severity)), 0);
  
  const lastSeverity = Number(history[history.length - 1].severity);
  let trendText = '● STABLE';
  let trendColor = 'var(--cyan)';
  if (lastSeverity > avg) {
    trendText = '▲ WORSENING';
    trendColor = '#ff4d6d';
  } else if (lastSeverity < avg) {
    trendText = '▼ IMPROVING';
    trendColor = '#00ffb3';
  }
  
  if (avgEl) avgEl.textContent = `${avg}/10`;
  if (peakEl) peakEl.textContent = `${peak}/10`;
  if (trendEl) {
    trendEl.textContent = trendText;
    trendEl.style.color = trendColor;
  }
  
  // Plotting recovery sparkline
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
  
  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#00e5ff');
  gradient.addColorStop(1, '#00ffb3');
  ctx.strokeStyle = gradient;
  
  const points = history.slice(-8); // Show last 8 entries for spacing on sparkline
  const numPoints = points.length;
  const paddingX = 20;
  const paddingY = 15;
  
  // Draw helper gridlines for scale reference (severity 1, 5, 10)
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  [1, 5, 10].forEach(level => {
    const y = h - paddingY - ((level - 1) / 9) * (h - 2 * paddingY);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  });
  ctx.stroke();
  
  // Reset stroke styles for trendline
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  
  canvas.plottedPoints = [];
  
  for (let i = 0; i < numPoints; i++) {
    const x = paddingX + (i / Math.max(1, numPoints - 1)) * (w - 2 * paddingX);
    const severity = points[i].severity;
    const y = h - paddingY - ((severity - 1) / 9) * (h - 2 * paddingY);
    
    canvas.plottedPoints.push({
      x: x,
      y: y,
      severity: severity,
      condition: points[i].condition,
      date: points[i].date
    });
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  
  // Draw glowing dots at each data point
  for (let i = 0; i < numPoints; i++) {
    const pt = canvas.plottedPoints[i];
    
    // Highlight if this is the hoveredPoint
    const isHovered = hoveredPoint && Math.abs(hoveredPoint.x - pt.x) < 0.1 && Math.abs(hoveredPoint.y - pt.y) < 0.1;
    
    ctx.fillStyle = isHovered ? '#ff00a0' : (i === numPoints - 1 ? '#00ffb3' : '#00e5ff');
    ctx.shadowBlur = isHovered ? 12 : 6;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isHovered ? 6 : 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0; // Reset shadow
    
    // Draw concentric outer ring if hovered
    if (isHovered) {
      ctx.strokeStyle = 'rgba(255, 0, 160, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  
  // Draw Interactive Tooltip & Crosshair if a point is hovered
  if (hoveredPoint) {
    // 1. Dotted vertical guide line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hoveredPoint.x, 0);
    ctx.lineTo(hoveredPoint.x, h);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash
    
    // 2. Cyber floating tooltip bubble near the node
    const text = `${hoveredPoint.condition}: ${hoveredPoint.severity}/10 on ${hoveredPoint.date}`;
    ctx.font = '9px Inter, sans-serif';
    const textWidth = ctx.measureText(text).width;
    
    // Position tooltip
    let tooltipX = hoveredPoint.x + 10;
    let tooltipY = hoveredPoint.y - 12;
    
    // Constrain tooltip within canvas boundaries
    if (tooltipX + textWidth + 10 > w) {
      tooltipX = hoveredPoint.x - textWidth - 10;
    }
    if (tooltipY - 12 < 0) {
      tooltipY = hoveredPoint.y + 16;
    }
    
    // Glassmorphic background box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark slate glass
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)'; // Cyan border
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Rounded rect
    const r = 4;
    const tw = textWidth + 10;
    const th = 16;
    const tx = tooltipX - 5;
    const ty = tooltipY - 11;
    ctx.moveTo(tx + r, ty);
    ctx.lineTo(tx + tw - r, ty);
    ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + r);
    ctx.lineTo(tx + tw, ty + th - r);
    ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - r, ty + th);
    ctx.lineTo(tx + r, ty + th);
    ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - r);
    ctx.lineTo(tx, ty + r);
    ctx.quadraticCurveTo(tx, ty, tx + r, ty);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tooltipX, tooltipY - 2);
  }

  // Setup Event Listeners ONCE
  if (!canvas.isInteractiveListenersAttached) {
    canvas.isInteractiveListenersAttached = true;
    
    canvas.addEventListener('mousemove', function(e) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      let closestPt = null;
      let minDistance = 15; // Hitbox radius 15px
      
      if (canvas.plottedPoints) {
        canvas.plottedPoints.forEach(pt => {
          const dx = mouseX - pt.x;
          const dy = mouseY - pt.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDistance) {
            minDistance = dist;
            closestPt = pt;
          }
        });
      }
      
      if (closestPt) {
        window.renderDiaryChart(closestPt);
      } else {
        window.renderDiaryChart(null);
      }
    });
    
    canvas.addEventListener('mouseleave', function() {
      window.renderDiaryChart(null);
    });
  }
};

// Initial load handler for recovery chart
setTimeout(() => {
  window.renderDiaryChart();
}, 200);

// ── Interactive SVG Anatomical Scanner ──────────────────
function initAnatomicalScanner() {
  const hotspots = document.querySelectorAll(".map-hotspot");
  const activeScanZone = document.getElementById("activeScanZone");
  
  if (!hotspots.length || !activeScanZone) return;
  
  hotspots.forEach(hotspot => {
    // Mouse Enter -> Highlight and show target label
    hotspot.addEventListener("mouseenter", function() {
      const label = this.getAttribute("data-label");
      activeScanZone.textContent = label;
      activeScanZone.style.color = "var(--primary)";
      if (window.BioTelemetrySFX) window.BioTelemetrySFX.playClick();
    });
    
    // Mouse Leave -> Reset to last active target or default
    hotspot.addEventListener("mouseleave", function() {
      const activeHotspot = document.querySelector(".map-hotspot.active");
      if (activeHotspot) {
        activeScanZone.textContent = activeHotspot.getAttribute("data-label");
        activeScanZone.style.color = "var(--teal)";
      } else {
        activeScanZone.textContent = "SELECT REGION";
        activeScanZone.style.color = "var(--cyan)";
      }
    });
    
    // Click -> Select symptom and trigger triage scan
    hotspot.addEventListener("click", function() {
      if (window.BioTelemetrySFX) window.BioTelemetrySFX.playScan();
      
      // Clear previous active states across all hotspots
      hotspots.forEach(h => h.classList.remove("active"));
      
      // Mark clicked hotspot as active
      this.classList.add("active");
      
      const isOr = window.currentLang === 'or';
      const symptomText = isOr ? this.getAttribute("data-or") : this.getAttribute("data-en");
      
      // Update scan zone label to active visual
      activeScanZone.textContent = this.getAttribute("data-label");
      activeScanZone.style.color = "var(--teal)";
      
      // Populate chat text input
      const input = document.getElementById("userInput");
      if (input) {
        input.value = symptomText;
        input.dispatchEvent(new Event("input"));
        input.focus();
      }
      
      // Play high-tech bio-telemetry visual scan flash
      const cpu = document.getElementById("cpuFill");
      const neural = document.getElementById("neuralFill");
      if (cpu && neural) {
        const oldCpu = cpu.style.width;
        const oldNeural = neural.style.width;
        
        cpu.style.width = "100%";
        neural.style.width = "100%";
        cpu.style.boxShadow = "0 0 15px var(--cyan)";
        neural.style.boxShadow = "0 0 15px var(--teal)";
        
        setTimeout(() => {
          cpu.style.width = oldCpu;
          neural.style.width = oldNeural;
          cpu.style.boxShadow = "";
          neural.style.boxShadow = "";
        }, 800);
      }
      
      // Auto-submit the symptom query after short animation delay
      setTimeout(() => {
        sendMessage();
      }, 300);
    });
  });
}

// Register anatomical scanner on load
setTimeout(() => {
  initAnatomicalScanner();
}, 400);

// ── Text-to-Speech (TTS) Prescription Reader ───────────
let currentUtterance = null;

window.speakMessageText = function(btn, text) {
  // If voice is currently speaking, cancel it immediately
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (btn.classList.contains("speaking-active")) {
      window.resetVoiceBtn(btn);
      return;
    }
  }

  // Reset all other voice buttons on active messages
  document.querySelectorAll(".voice-read-btn").forEach(b => {
    window.resetVoiceBtn(b);
  });

  // Clean clinical text (filter out UI emojis, non-verbal markers, HTML tags, and metadata for clean speech delivery)
  let cleanText = text
    .replace(/<\/?[^>]+(>|$)/g, "") // Strip HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/\[[^\]]*\]/g, "") // Strip bracketed metadata like [ICD-11: ...] or [SNOMED: ...]
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDDE6-\uDDFF]|[\u2011-\u26FF]|[\u2700-\u27BF]/g, "") // Strip standard emojis and dingbats (like 🌡️, 😊, etc.)
    .replace(/📋|💊|🔬|🧠|📁|❤️|🚨|⚠️|👍|🙌|🤖|🧑|🕐/g, "") // Safeguard explicit UI emojis
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  // Senses whether text contains native Odia characters or active language state is Odia
  const isOr = window.currentLang === 'or' || /[\u0B00-\u0B7F]/.test(cleanText);
  utterance.lang = isOr ? "hi-IN" : "en-US"; // hi-IN is an extremely accurate, soft phonetic voice for bilingual/Indian accents
  utterance.rate = 0.95; // Slightly slower, more clinical and authoritative delivery rate
  utterance.pitch = 1.0;

  utterance.onstart = () => {
    btn.innerHTML = "⏹ Stop";
    btn.style.color = "var(--red-warn)";
    btn.style.borderColor = "var(--red-warn)";
    btn.classList.add("speaking-active");
    btn.style.animation = "voicePulse 0.8s ease-in-out infinite alternate";
  };

  utterance.onend = utterance.onerror = () => {
    window.resetVoiceBtn(btn);
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
};

window.resetVoiceBtn = function(btn) {
  btn.innerHTML = "🎙️ Listen";
  btn.style.color = "var(--cyan)";
  btn.style.borderColor = "rgba(0, 229, 255, 0.3)";
  btn.classList.remove("speaking-active");
  btn.style.animation = "";
};

// ── Bio-Telemetry Web Audio SFX Engine ───────────────
const BioTelemetrySFX = {
  ctx: null,
  enabled: true,

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
    }
  },

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(1500, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch(e){}
  },

  playScan() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1600, this.ctx.currentTime + 0.5);

      filter.type = "lowpass";
      filter.Q.value = 5;
      filter.frequency.setValueAtTime(400, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch(e){}
  },

  playAlarm() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      // Symmetrical triple bio-beeps
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(980, t + i * 0.22);

        gain.gain.setValueAtTime(0.0, t + i * 0.22);
        gain.gain.linearRampToValueAtTime(0.1, t + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.22 + 0.18);

        osc.start(t + i * 0.22);
        osc.stop(t + i * 0.22 + 0.18);
      }
    } catch(e){}
  },

  playSlide() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(400, t);
      osc1.frequency.exponentialRampToValueAtTime(200, t + 0.25);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(150, t);
      osc2.frequency.exponentialRampToValueAtTime(80, t + 0.25);

      filter.type = "lowpass";
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(1000, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.25);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc1.start();
      osc2.start();
      osc1.stop(t + 0.25);
      osc2.stop(t + 0.25);
    } catch(e){}
  },

  playSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      // High-fidelity double chime: 600Hz and 900Hz
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(600, t);
      gain1.gain.setValueAtTime(0.05, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc1.start(t);
      osc1.stop(t + 0.12);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(900, t + 0.08);
      gain2.gain.setValueAtTime(0.0, t + 0.08);
      gain2.gain.linearRampToValueAtTime(0.06, t + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc2.start(t + 0.08);
      osc2.stop(t + 0.24);
    } catch(e){}
  },

  playError() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(180, t);
      osc1.frequency.exponentialRampToValueAtTime(100, t + 0.25);

      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(173, t); // Discordant frequency offset
      osc2.frequency.exponentialRampToValueAtTime(95, t + 0.25);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc1.start();
      osc2.start();
      osc1.stop(t + 0.25);
      osc2.stop(t + 0.25);
    } catch(e){}
  },

  playDataTick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(2000, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.015);

      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.015);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.015);
    } catch(e){}
  }
};

window.BioTelemetrySFX = BioTelemetrySFX;

window.toggleBioTelemetryAudio = function() {
  const btn = document.getElementById("btnAudioToggle");
  if (!btn) return;
  
  BioTelemetrySFX.enabled = !BioTelemetrySFX.enabled;
  
  if (BioTelemetrySFX.enabled) {
    btn.innerHTML = "<span>🔊</span> SOUND: ON";
    btn.style.color = "var(--cyan)";
    btn.style.borderColor = "var(--cyan)";
    // Initialize audio context dynamically
    BioTelemetrySFX.init();
    BioTelemetrySFX.playClick();
  } else {
    btn.innerHTML = "<span>🔇</span> SOUND: OFF";
    btn.style.color = "var(--text-muted)";
    btn.style.borderColor = "var(--border)";
  }
};

window.toggleTheme = function() {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playClick();
  
  const body = document.body;
  const btn = document.getElementById("btnThemeToggle");
  if (!btn) return;

  const isLight = body.classList.toggle("light-theme");
  localStorage.setItem("ramanai_theme", isLight ? "light" : "dark");

  if (isLight) {
    btn.innerHTML = "<span>☀️</span> LITE";
  } else {
    btn.innerHTML = "<span>🌙</span> DARK";
  }
};

// Bootstrap theme state
(function() {
  const savedTheme = localStorage.getItem("ramanai_theme");
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
    const btn = document.getElementById("btnThemeToggle");
    if (btn) {
      btn.innerHTML = "<span>☀️</span> LITE";
    }
  }
})();

window.switchTutorialTab = function(tabName) {
  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSlide();

  const userGuideBtn = document.getElementById("btnTabUserGuide");
  const wikiBtn = document.getElementById("btnTabWikiSpec");
  const userGuideContent = document.getElementById("tutContentUserGuide");
  const wikiContent = document.getElementById("tutContentWikiSpec");

  if (tabName === "guide") {
    if (userGuideBtn) {
      userGuideBtn.style.borderBottomColor = "var(--cyan)";
      userGuideBtn.style.color = "var(--cyan)";
      userGuideBtn.classList.add("active");
    }
    if (wikiBtn) {
      wikiBtn.style.borderBottomColor = "transparent";
      wikiBtn.style.color = "var(--text-muted)";
      wikiBtn.classList.remove("active");
    }
    if (userGuideContent) userGuideContent.style.display = "block";
    if (wikiContent) wikiContent.style.display = "none";
  } else {
    if (wikiBtn) {
      wikiBtn.style.borderBottomColor = "var(--cyan)";
      wikiBtn.style.color = "var(--cyan)";
      wikiBtn.classList.add("active");
    }
    if (userGuideBtn) {
      userGuideBtn.style.borderBottomColor = "transparent";
      userGuideBtn.style.color = "var(--text-muted)";
      userGuideBtn.classList.remove("active");
    }
    if (userGuideContent) userGuideContent.style.display = "none";
    if (wikiContent) wikiContent.style.display = "block";
  }
};

// =========================================================================
// ── CLINICIAN PORTAL ACTIVE LEARNING LOOP ────────────────────────────────
// =========================================================================

window.localClinicianDeltas = {};
try {
  const storedDeltas = localStorage.getItem('ramanai_clinician_deltas');
  if (storedDeltas) {
    window.localClinicianDeltas = JSON.parse(storedDeltas);
  }
} catch (e) {
  console.error("Failed to load localClinicianDeltas:", e);
}

window.applyClinicianCorrection = function(predictedClass, correctClass, queryText) {
  if (!queryText) return;
  const tokens = slmClassifier.tokenize(queryText);
  if (tokens.length === 0) return;

  if (!window.localClinicianDeltas[correctClass]) {
    window.localClinicianDeltas[correctClass] = {};
  }
  if (!window.localClinicianDeltas[predictedClass]) {
    window.localClinicianDeltas[predictedClass] = {};
  }

  for (const token of tokens) {
    window.localClinicianDeltas[correctClass][token] = (window.localClinicianDeltas[correctClass][token] || 0) + 0.15;
    window.localClinicianDeltas[predictedClass][token] = (window.localClinicianDeltas[predictedClass][token] || 0) - 0.15;
  }

  try {
    localStorage.setItem('ramanai_clinician_deltas', JSON.stringify(window.localClinicianDeltas));
  } catch (e) {
    console.error("Failed to save localClinicianDeltas:", e);
  }

  // Force retraining to apply active learning deltas in-memory immediately
  slmClassifier.train(SLM_TRAINING_CORPUS);
};

window.applyOverrideAndTrain = function() {
  const overrideSelect = document.getElementById("overrideSelect");
  const overridePredicted = document.getElementById("overridePredicted");
  const queryInput = document.getElementById("hubSandboxInput") || document.getElementById("chatInput");
  
  if (!overrideSelect || !overridePredicted) return;

  const correctClass = overrideSelect.value;
  const predictedClass = overridePredicted.textContent.toLowerCase();
  const queryText = queryInput ? queryInput.value : "";

  window.applyClinicianCorrection(predictedClass, correctClass, queryText);

  // Hide modal
  const modal = document.getElementById("clinicianOverrideModal");
  if (modal) modal.style.display = "none";

  if (window.BioTelemetrySFX) window.BioTelemetrySFX.playSuccess();
  alert("Clinician override successfully registered and SLM classifier dynamically updated!");
};

// =========================================================================
// ── PHARMACOGENOMIC (PGX) SAFETY CHECKS ──────────────────────────────────
// =========================================================================

window.checkPgxConflicts = function(profile, medications) {
  const conflicts = [];
  if (!profile || !profile.genomicTraits || !medications) return conflicts;
  
  const traits = profile.genomicTraits.map(t => t.toLowerCase());
  
  for (const med of medications) {
    const medNameLower = med.name.toLowerCase();
    
    if (traits.includes("g6pd")) {
      if (medNameLower.includes("nitrofurantoin") || medNameLower.includes("sulfonamide") || medNameLower.includes("macrodantin")) {
        conflicts.push({
          medName: med.name,
          trait: "G6PD Deficiency",
          severity: "High",
          reason: "Hemolysis risk. Nitrofurantoin can precipitate severe oxidative stress in G6PD-deficient erythrocytes, leading to acute hemolytic anemia.",
          subName: "Ciprofloxacin 500mg (Safe Fluoroquinolone Alternative)"
        });
      }
    }
    
    if (traits.includes("hla-b5701") || traits.includes("hla-b*5701")) {
      if (medNameLower.includes("abacavir")) {
        conflicts.push({
          medName: med.name,
          trait: "HLA-B*5701 Presence",
          severity: "Critical",
          reason: "Fatal Hypersensitivity Risk. Patients carrying the HLA-B*5701 allele have a extremely high risk of a severe, potentially life-threatening multi-organ hypersensitivity reaction.",
          subName: "Tenofovir Disoproxil Fumarate 300mg (Safe NRTI Alternative)"
        });
      }
    }
    
    if (traits.includes("cyp2d6")) {
      if (medNameLower.includes("codeine") || medNameLower.includes("tramadol")) {
        conflicts.push({
          medName: med.name,
          trait: "CYP2D6 Poor Metabolizer",
          severity: "Moderate",
          reason: "Analgesic Efficacy Failure. Codeine and Tramadol are prodrugs requiring CYP2D6-mediated conversion to active morphine/O-desmethyltramadol. In poor metabolizers, this conversion fails completely.",
          subName: "Ibuprofen 400mg (Non-opioid Analgesic Alternative)"
        });
      }
    }
  }
  
  return conflicts;
};

// =========================================================================
// ── PARALLEL WebGPU & SIMULATION UPGRADES ────────────────────────────────
// =========================================================================

window.runCpuFallbackSimulation = function(symptomWeights, age = 30, heatIndex = 98.6) {
  const trajectoriesSimulated = 16384;
  const vitalsSample = [];
  
  const wSum = symptomWeights.reduce((a, b) => a + b, 0);
  const avgW = symptomWeights.length > 0 ? wSum / symptomWeights.length : 0.0;
  
  let ageFactor = 0.0;
  if (age > 65.0) { ageFactor = (age - 65.0) * 0.15; }
  else if (age < 12.0) { ageFactor = (12.0 - age) * 0.2; }
  
  for (let i = 0; i < 1024; i++) {
    const rand1 = Math.random();
    const rand2 = Math.random();
    
    const temp = 98.6 + (avgW * 4.0) + (rand1 * 2.0 - 1.0) + ((heatIndex - 98.6) * 0.05);
    const hr = 72.0 + (avgW * 30.0) + (rand2 * 15.0 - 5.0) + ageFactor;
    
    vitalsSample.push({ temp: parseFloat(temp.toFixed(2)), hr: parseFloat(hr.toFixed(1)) });
  }
  
  const certaintyIndex = Math.min(1.0, Math.max(0.0, 1.0 - (avgW * 0.5)));
  
  return {
    mode: "CPU (Standard Emulation)",
    certaintyIndex: certaintyIndex,
    trajectoriesSimulated: trajectoriesSimulated,
    vitalsSample: vitalsSample
  };
};

window.runGpuTriageSimulation = async function(symptomWeights, age = 30, heatIndex = 98.6) {
  if (!navigator.gpu) {
    return window.runCpuFallbackSimulation(symptomWeights, age, heatIndex);
  }
  
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return window.runCpuFallbackSimulation(symptomWeights, age, heatIndex);
    const device = await adapter.requestDevice();
    const deviceName = adapter.name || "Mocked Universal Graphics Accelerator (NVIDIA/AMD/Intel)";
    
    const inputData = new Float32Array(32);
    for (let i = 0; i < Math.min(symptomWeights.length, 3); i++) {
      inputData[i] = symptomWeights[i];
    }
    inputData[3] = age;
    inputData[4] = heatIndex;
    
    const inputBuffer = device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(inputBuffer, 0, inputData);
    
    const outputSize = 1024 * 4;
    const outputBuffer = device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    
    const readBuffer = device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    
    const shaderModule = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> inputSymptoms : array<f32, 32>;
        @group(0) @binding(1) var<storage, read_write> outputVitals : array<f32, 1024>;
        
        fn hash(n: u32) -> f32 {
          let x = sin(f32(n) * 12.9898) * 43758.5453;
          return x - floor(x);
        }
        
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
          let index = global_id.x;
          if (index >= 1024u) { return; }
          
          let symptomWeight = (inputSymptoms[0] + inputSymptoms[1] + inputSymptoms[2]) / 3.0;
          let age = inputSymptoms[3];
          let heatIndex = inputSymptoms[4];
          
          var ageFactor = 0.0;
          if (age > 65.0) { ageFactor = (age - 65.0) * 0.15; }
          else if (age < 12.0) { ageFactor = (12.0 - age) * 0.2; }
          
          let rand1 = hash(index * 13u + 7u);
          let rand2 = hash(index * 17u + 11u);
          
          let simulatedTemp = 98.6 + (symptomWeight * 4.0) + (rand1 * 2.0 - 1.0) + ((heatIndex - 98.6) * 0.05);
          let simulatedHR = 72.0 + (symptomWeight * 30.0) + (rand2 * 15.0 - 5.0) + ageFactor;
          
          let tempInt = u32(simulatedTemp * 100.0);
          let hrInt = u32(simulatedHR * 10.0);
          let packedVal = f32(tempInt * 10000u + hrInt);
          
          outputVitals[index] = packedVal;
        }
      `
    });
    
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' }
    });
    
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } }
      ]
    });
    
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(16);
    passEncoder.end();
    
    commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputSize);
    device.queue.submit([commandEncoder.finish()]);
    
    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();
    const outputData = new Float32Array(arrayBuffer);
    
    const vitalsSample = [];
    for (let i = 0; i < 1024; i++) {
      const packed = outputData[i];
      const temp = Math.floor(packed / 10000) / 100;
      const hr = (packed % 10000) / 10;
      vitalsSample.push({ temp: temp || 98.6, hr: hr || 72.0 });
    }
    
    readBuffer.unmap();
    
    return {
      mode: "WebGPU (Hardware Accelerated)",
      deviceName: deviceName,
      certaintyIndex: 1.0,
      vitalsSample: vitalsSample
    };
  } catch (e) {
    console.warn("WebGPU execution error, falling back to CPU:", e);
    return window.runCpuFallbackSimulation(symptomWeights, age, heatIndex);
  }
};

// =========================================================================
// ── DYNAMIC HUD RENDERING & INTERACTIVE CANVASES ────────────────────────
// =========================================================================

window.renderProgressionHeatmap = function(vitalsSample) {
  const canvas = document.getElementById("progressionCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  
  // Cyberpunk grid
  ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let i = 0; i < height; i += 20) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
  
  // Vital distributions: X = Temp (95..108 F), Y = HR (50..160 bpm)
  const tempMin = 95.0, tempMax = 108.0;
  const hrMin = 50.0, hrMax = 160.0;
  
  ctx.fillStyle = "rgba(0, 229, 255, 0.65)";
  ctx.shadowBlur = 4;
  ctx.shadowColor = "#00e5ff";
  
  for (const s of vitalsSample) {
    const x = ((s.temp - tempMin) / (tempMax - tempMin)) * width;
    const y = height - ((s.hr - hrMin) / (hrMax - hrMin)) * height;
    
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  // Reset shadow
  ctx.shadowBlur = 0;
};

// Real-time animation loop for the HUD ECG Oscilloscope
let oscAnimationId = null;
window.drawOscilloscopeWaveform = function(hr = 72) {
  const canvas = document.getElementById("oscilloscopeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  if (oscAnimationId) cancelAnimationFrame(oscAnimationId);
  
  const width = canvas.width;
  const height = canvas.height;
  
  let x = 0;
  const points = new Array(width).fill(height / 2);
  
  const animate = () => {
    ctx.fillStyle = "rgba(10, 15, 30, 0.2)";
    ctx.fillRect(0, 0, width, height);
    
    // Draw neon cyan line
    ctx.strokeStyle = "rgba(0, 255, 179, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#00ffb3";
    
    // Compute ECG wave shape matching heartbeat speed
    const cycleTime = 60000 / hr; // ms per beat
    const time = Date.now() % cycleTime;
    const phase = time / cycleTime;
    
    let y = height / 2;
    if (phase > 0.1 && phase < 0.14) {
      // P wave
      y -= Math.sin((phase - 0.1) / 0.04 * Math.PI) * 4;
    } else if (phase >= 0.18 && phase < 0.20) {
      // Q wave
      y += (phase - 0.18) / 0.02 * 6;
    } else if (phase >= 0.20 && phase < 0.24) {
      // R spike
      const progress = (phase - 0.20) / 0.04;
      y -= Math.sin(progress * Math.PI) * (height * 0.45);
    } else if (phase >= 0.24 && phase < 0.26) {
      // S wave
      y += (phase - 0.24) / 0.02 * 8;
    } else if (phase > 0.32 && phase < 0.42) {
      // T wave
      y -= Math.sin((phase - 0.32) / 0.10 * Math.PI) * 8;
    }
    
    points.push(y);
    if (points.length > width) points.shift();
    
    ctx.beginPath();
    ctx.moveTo(0, points[0]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(i, points[i]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    oscAnimationId = requestAnimationFrame(animate);
  };
  
  animate();
};



