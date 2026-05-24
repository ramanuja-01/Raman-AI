const fs = require('fs');
const path = require('path');

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

const appJsPath = path.join(__dirname, '..', 'app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

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

eval(code);

const text = "what can i eat in breakfast";
const cleanWords = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ").trim().split(/\s+/);
console.log("cleanWords:", cleanWords);

const vocabularyList = Array.from(slmClassifier.vocabulary);
console.log("slmClassifier vocabulary word count:", vocabularyList.length);

console.log("Vocabulary words in query:");
for (const w of cleanWords) {
  if (slmClassifier.vocabulary.has(w)) {
    console.log(`- "${w}" is in vocabulary!`);
  }
}

console.log("Health keywords in query:");
for (const w of cleanWords) {
  // Let's print out if it matches healthKeywords (which we'll extract from code or mock)
}
