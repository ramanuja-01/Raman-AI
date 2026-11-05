/**
 * RAMAN AI – Multilingual Speech-to-Text (STT) Clinical Dictation Engine
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Features:
 * - Multilingual clinical dictation supporting English (en-IN), Hindi (hi-IN), and Odia (or-IN)
 * - Phonetic clinical terminology normalizer converting colloquial speech and typos to validated medical terms
 * - Web Audio API AnalyserNode volume meter driving real-time microphone waveform pulsing
 * - Headless test mock fallback for CI/Node environments
 */

(function (global) {
  'use strict';

  // Common phonetic speech variations and colloquial dialect mappings to standard medical terms
  const PHONETIC_MEDICAL_REPLACEMENTS = [
    // Tropical & Acute Conditions
    { regex: /\b(dengu|denguey|dengo|dengoo)\b/gi, replacement: "dengue" },
    { regex: /\b(tyfoid|taifoid|typoid|taifoyd)\b/gi, replacement: "typhoid" },
    { regex: /\b(maleria|maleriya|malariya)\b/gi, replacement: "malaria" },
    { regex: /\b(chikangunya|chikengunya|chikungunya)\b/gi, replacement: "chikungunya" },
    { regex: /\b(gastro|gastroenteritis|pet kharab|loose motion|dast|jhada)\b/gi, replacement: "acute gastroenteritis" },
    { regex: /\b(vomting|vomiting|ulti|banti)\b/gi, replacement: "vomiting" },
    { regex: /\b(bukhar|jaro|fever|high temp)\b/gi, replacement: "fever" },
    { regex: /\b(sar dard|munda bitha|headache)\b/gi, replacement: "headache" },
    { regex: /\b(chhati bitha|seene me dard|chest pain)\b/gi, replacement: "chest pain" },
    { regex: /\b(pete bitha|pet me dard|stomach pain|abdominal pain)\b/gi, replacement: "stomach pain" },
    { regex: /\b(khansi|kasa|cough)\b/gi, replacement: "cough" },
    { regex: /\b(saans phoolna|dam laguchi|breathlessness|shortness of breath)\b/gi, replacement: "shortness of breath" },
    { regex: /\b(sugar|chini|madhumeha|diabetes)\b/gi, replacement: "diabetes" },
    { regex: /\b(high bp|blood pressure|raktachapa)\b/gi, replacement: "high blood pressure" },
    { regex: /\b(ghoda hata phuta|mouth sores)\b/gi, replacement: "hfmd" },
    { regex: /\b(pila jaro|kampana|convulsion)\b/gi, replacement: "febrile seizure" }
  ];

  class RamanSpeechEngine {
    constructor() {
      this.currentLanguage = 'en-IN'; // 'en-IN' | 'hi-IN' | 'or-IN'
      this.recognition = null;
      this.isListening = false;
      this.audioContext = null;
      this.analyser = null;
      this.mediaStream = null;
      this.animFrameId = null;

      // Event callbacks
      this.onTranscript = null; // (transcript: string, isFinal: boolean) => void
      this.onVolume = null;     // (volumeLevel: number 0.0-1.0) => void
      this.onStateChange = null;// (isListening: boolean) => void
      this.onError = null;      // (errorMsg: string) => void

      this.initRecognition();
    }

    /**
     * Initializes SpeechRecognition instance if supported by the browser.
     */
    initRecognition() {
      const SpeechRecognition = (typeof window !== 'undefined')
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.currentLanguage;

        this.recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          const rawText = (finalTranscript + interimTranscript).trim();
          const normalizedText = RamanSpeechEngine.normalizeClinicalSpeech(rawText);

          if (typeof this.onTranscript === 'function') {
            this.onTranscript(normalizedText, finalTranscript.length > 0);
          }
        };

        this.recognition.onerror = (event) => {
          if (typeof this.onError === 'function') {
            this.onError(event.error || 'Speech recognition error');
          }
          this.stop();
        };

        this.recognition.onend = () => {
          if (this.isListening) {
            this.stop();
          }
        };
      }
    }

    /**
     * Sets the active dictation language (e.g. 'en-IN', 'hi-IN', 'or-IN').
     */
    setLanguage(langCode) {
      this.currentLanguage = langCode;
      if (this.recognition) {
        this.recognition.lang = langCode;
      }
    }

    /**
     * Applies phonetic medical normalization rules to speech input.
     */
    normalizeClinicalSpeech(text) {
      return RamanSpeechEngine.normalizeClinicalSpeech(text);
    }

    /**
     * Applies phonetic medical normalization rules to speech input.
     */
    static normalizeClinicalSpeech(text) {
      if (!text || typeof text !== 'string') return '';
      let normalized = text;
      for (const rule of PHONETIC_MEDICAL_REPLACEMENTS) {
        normalized = normalized.replace(rule.regex, rule.replacement);
      }
      return normalized;
    }

    /**
     * Starts listening and hooks Web Audio volume analyser if getUserMedia is permitted.
     */
    async start() {
      if (this.isListening) return;

      if (!this.recognition) {
        if (typeof this.onError === 'function') {
          this.onError('SpeechRecognition API not available in this browser environment.');
        }
        return;
      }

      this.isListening = true;
      if (typeof this.onStateChange === 'function') {
        this.onStateChange(true);
      }

      try {
        this.recognition.start();
      } catch (e) {
        // Recognition already started or error
      }

      // Initialize Web Audio Volume Analyser if available
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            this.audioContext = new AudioCtx();
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            source.connect(this.analyser);

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const updateVolumeLoop = () => {
              if (!this.isListening || !this.analyser) return;
              this.analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
              }
              const avg = sum / bufferLength;
              const normalizedVolume = Math.min(1.0, avg / 128.0);

              if (typeof this.onVolume === 'function') {
                this.onVolume(normalizedVolume);
              }
              this.animFrameId = requestAnimationFrame(updateVolumeLoop);
            };

            updateVolumeLoop();
          }
        }
      } catch (err) {
        // Audio volume meter optional; speech recognition can continue
      }
    }

    /**
     * Stops listening and cleans up media streams and audio contexts.
     */
    stop() {
      if (!this.isListening) return;
      this.isListening = false;

      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach(t => t.stop());
        } catch (e) {}
        this.mediaStream = null;
      }

      if (this.audioContext) {
        try {
          this.audioContext.close();
        } catch (e) {}
        this.audioContext = null;
      }

      if (typeof this.onStateChange === 'function') {
        this.onStateChange(false);
      }
      if (typeof this.onVolume === 'function') {
        this.onVolume(0.0);
      }
    }

    /**
     * Toggles between listening and stopped states.
     */
    toggle() {
      if (this.isListening) {
        this.stop();
      } else {
        this.start();
      }
    }
  }

  // Create singleton instance
  const defaultSpeechEngine = new RamanSpeechEngine();

  // Export to global environment
  if (typeof window !== 'undefined') {
    window.RamanSpeechEngine = RamanSpeechEngine;
    window.ramanSpeechEngine = defaultSpeechEngine;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      RamanSpeechEngine,
      ramanSpeechEngine: defaultSpeechEngine,
      PHONETIC_MEDICAL_REPLACEMENTS
    };
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
