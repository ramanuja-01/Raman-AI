/**
 * RAMAN AI – Offline BM25 + Dense Vector Hybrid Search Engine
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Implements sub-10ms offline clinical retrieval across medical reference manuals and pharmacopeia:
 * 1. BM25 Okapi lexical scoring (k1 = 1.2, b = 0.75, Robertson-Spärck Jones IDF)
 * 2. 64-dimensional dense semantic vector cosine similarity
 * 3. Reciprocal Rank Fusion (RRF) combining lexical and semantic rankings:
 *      RRF(d) = 1 / (60 + Rank_BM25(d)) + 1 / (60 + Rank_Dense(d))
 */

class RamanHybridSearchEngine {
  constructor(k1 = 1.2, b = 0.75, embeddingDim = 64) {
    this.k1 = k1;
    this.b = b;
    this.embeddingDim = embeddingDim;
    this.documents = [];
    this.docLengths = [];
    this.avgDocLength = 0;
    this.invertedIndex = new Map(); // term -> Map(docId, freq)
    this.docFrequencies = new Map(); // term -> count of docs containing term
    this.denseVectors = []; // Array of Float32Array (normalized)
    this.isIndexed = false;
  }

  // Basic clinical tokenizer with punctuation stripping & lowercasing
  static tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  // Generates a deterministic 64-dimensional dense embedding for text
  static generateEmbedding(text, dim = 64) {
    const vec = new Float32Array(dim);
    const tokens = RamanHybridSearchEngine.tokenize(text);
    if (tokens.length === 0) return vec;

    for (const token of tokens) {
      // Feature hashing into the vector space with sign hashing
      for (let i = 0; i < token.length - 1; i++) {
        const bi = token.charCodeAt(i) * 31 + token.charCodeAt(i + 1);
        const idx = Math.abs(bi) % dim;
        const sign = (bi & 1) === 0 ? 1.0 : -1.0;
        vec[idx] += sign * (1.0 / (i + 1));
      }
    }

    // L2 Normalize
    let norm = 0.0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vec[i] /= norm;
    }
    return vec;
  }

  // Cosine similarity between two unit vectors
  static cosineSimilarity(v1, v2) {
    let dot = 0.0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
    }
    return dot;
  }

  /**
   * Builds the inverted index and dense embeddings from documents.
   * @param {Array<Object>} docs - Array of { id, title, content, category, metadata }
   */
  indexDocuments(docs) {
    this.documents = docs;
    const N = docs.length;
    this.docLengths = new Array(N);
    this.denseVectors = new Array(N);
    this.invertedIndex.clear();
    this.docFrequencies.clear();

    let totalLength = 0;

    for (let i = 0; i < N; i++) {
      const doc = docs[i];
      const combinedText = `${doc.title || ""} ${doc.content || ""} ${doc.category || ""}`;
      const tokens = RamanHybridSearchEngine.tokenize(combinedText);
      const len = tokens.length;
      this.docLengths[i] = len;
      totalLength += len;

      // Inverted index frequencies
      const termCounts = new Map();
      for (const t of tokens) {
        termCounts.set(t, (termCounts.get(t) || 0) + 1);
      }

      for (const [term, freq] of termCounts.entries()) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, new Map());
        }
        this.invertedIndex.get(term).set(i, freq);
        this.docFrequencies.set(term, (this.docFrequencies.get(term) || 0) + 1);
      }

      // Pre-compute dense embedding
      this.denseVectors[i] = RamanHybridSearchEngine.generateEmbedding(combinedText, this.embeddingDim);
    }

    this.avgDocLength = N > 0 ? (totalLength / N) : 0;
    this.isIndexed = true;
  }

  /**
   * Computes BM25 Okapi lexical scores for a query.
   */
  scoreBm25(queryTokens) {
    const N = this.documents.length;
    const scores = new Float32Array(N);

    for (const token of queryTokens) {
      const posting = this.invertedIndex.get(token);
      if (!posting) continue;

      const df = this.docFrequencies.get(token) || 0;
      // Robertson-Spärck Jones IDF
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const [docId, tf] of posting.entries()) {
        const docLen = this.docLengths[docId];
        const denom = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        const termScore = idf * ((tf * (this.k1 + 1)) / denom);
        scores[docId] += termScore;
      }
    }
    return scores;
  }

  /**
   * Computes Dense Semantic similarity scores for a query.
   */
  scoreDense(queryEmbedding) {
    const N = this.documents.length;
    const scores = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      scores[i] = RamanHybridSearchEngine.cosineSimilarity(queryEmbedding, this.denseVectors[i]);
    }
    return scores;
  }

  /**
   * Executes hybrid search using Reciprocal Rank Fusion (RRF).
   * @param {string} queryString
   * @param {number} topK
   * @returns {Array<Object>} Ranked search results with RRF scores
   */
  search(queryString, topK = 5) {
    if (!this.isIndexed || this.documents.length === 0) return [];
    const queryTokens = RamanHybridSearchEngine.tokenize(queryString);
    if (queryTokens.length === 0) return [];

    const queryEmbedding = RamanHybridSearchEngine.generateEmbedding(queryString, this.embeddingDim);

    // 1. BM25 scoring & ranking
    const bm25Scores = this.scoreBm25(queryTokens);
    const bm25Ranked = [];
    for (let i = 0; i < this.documents.length; i++) {
      if (bm25Scores[i] > 0) bm25Ranked.push({ id: i, score: bm25Scores[i] });
    }
    bm25Ranked.sort((a, b) => b.score - a.score);

    const bm25RankMap = new Map();
    bm25Ranked.forEach((item, rank) => bm25RankMap.set(item.id, rank + 1));

    // 2. Dense semantic scoring & ranking
    const denseScores = this.scoreDense(queryEmbedding);
    const denseRanked = [];
    for (let i = 0; i < this.documents.length; i++) {
      denseRanked.push({ id: i, score: denseScores[i] });
    }
    denseRanked.sort((a, b) => b.score - a.score);

    const denseRankMap = new Map();
    denseRanked.forEach((item, rank) => denseRankMap.set(item.id, rank + 1));

    // 3. Reciprocal Rank Fusion (RRF, constant k = 60)
    const RRF_K = 60;
    const candidateIds = new Set([...bm25RankMap.keys(), ...denseRanked.slice(0, 20).map(d => d.id)]);
    const fusedResults = [];

    for (const docId of candidateIds) {
      const rBm25 = bm25RankMap.get(docId) || 1000;
      const rDense = denseRankMap.get(docId) || 1000;

      const rrfScore = (1.0 / (RRF_K + rBm25)) + (1.0 / (RRF_K + rDense));
      fusedResults.push({
        document: this.documents[docId],
        rrfScore: parseFloat(rrfScore.toFixed(5)),
        bm25Score: parseFloat((bm25Scores[docId] || 0).toFixed(3)),
        denseScore: parseFloat((denseScores[docId] || 0).toFixed(3)),
        bm25Rank: rBm25 < 1000 ? rBm25 : null,
        denseRank: rDense < 1000 ? rDense : null
      });
    }

    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    return fusedResults.slice(0, topK);
  }
}

// Builds the default medical reference corpus from knowledge base
function createDefaultMedicalCorpus(medicalKb) {
  const corpus = [];
  const kb = medicalKb || {};

  for (const [key, val] of Object.entries(kb)) {
    // Condition guide
    corpus.push({
      id: `condition-${key}`,
      title: `${key.toUpperCase()} (ICD-11: ${val.icd11 || 'N/A'})`,
      category: "Condition",
      content: `Symptoms, differential diagnosis: ${(val.conditions || []).join(", ")}. Precautions: ${(val.precautions || []).join("; ")}. Diet: ${(val.diet || []).join("; ")}. Specialist: ${val.specialist || "General Physician"}.`,
      metadata: { key, icd11: val.icd11 }
    });

    // Medications
    (val.medications || []).forEach((med, idx) => {
      corpus.push({
        id: `med-${key}-${idx}`,
        title: med.name,
        category: "Pharmacology",
        content: `Indication: ${key}. SNOMED: ${med.snomed || 'N/A'}. Dose: ${med.dose}. Clinical Notes & Pharmacology: ${med.note || ''}`,
        metadata: { condition: key, snomed: med.snomed, dose: med.dose }
      });
    });
  }

  // Drug contraindications & interactions
  corpus.push({
    id: "pgx-nitrofurantoin",
    title: "Nitrofurantoin & G6PD Deficiency Contraindication",
    category: "Pharmacogenomics",
    content: "Nitrofurantoin causes severe hemolytic anemia in patients with glucose-6-phosphate dehydrogenase (G6PD) deficiency. Strictly contraindicated; substitute with Fosfomycin or Ciprofloxacin."
  });
  corpus.push({
    id: "pgx-abacavir",
    title: "Abacavir & HLA-B*5701 Hypersensitivity Warning",
    category: "Pharmacogenomics",
    content: "Abacavir causes severe life-threatening multisystem hypersensitivity reactions in patients positive for the HLA-B*5701 allele. Mandatory pre-treatment genetic screening required."
  });
  corpus.push({
    id: "allergy-nsaid",
    title: "NSAID Allergy & Cross-Reactivity",
    category: "Safety",
    content: "Patients allergic to Aspirin or Ibuprofen cross-react with other COX inhibitors. Substitute with Paracetamol (Acetaminophen) for analgesia and antipyresis."
  });

  return corpus;
}

// Global initialization
if (typeof window !== 'undefined') {
  window.RamanHybridSearchEngine = RamanHybridSearchEngine;
  window.createDefaultMedicalCorpus = createDefaultMedicalCorpus;
  
  // Create shared instance attached to window
  if (typeof window.MEDICAL_KB !== 'undefined') {
    const defaultCorpus = createDefaultMedicalCorpus(window.MEDICAL_KB);
    window.ramanSearchEngine = new RamanHybridSearchEngine();
    window.ramanSearchEngine.indexDocuments(defaultCorpus);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanHybridSearchEngine,
    createDefaultMedicalCorpus
  };
}
