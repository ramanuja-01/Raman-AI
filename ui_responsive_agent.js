/**
 * RAMAN AI – Experiment No. 170
 * Module: ui_responsive_agent.js
 * 
 * Autonomous Client-Side Real-Time UI Responsiveness & Self-Healing Engine
 * 100% Offline, Zero-Cloud, Event-Driven Layout Supervisor
 * 
 * Target Form Factors: Desktop (>=1024px), Tablets (600-1024px), Mobile (<600px)
 */

class RamanUiAgent {
  constructor(options = {}) {
    this.version = "2.3.0";
    this.isTouch = (typeof window !== 'undefined') && (
      ('ontouchstart' in window) || 
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
    this.lastTier = null;
    this.mutationLock = false;
    this.mutationTimestamps = [];
    this.circuitBreakerTripped = false;
    this.totalAudits = 0;
    this.totalCorrections = 0;
    this.MAX_MUTATIONS_PER_SEC = options.maxMutationsPerSec || 5;
    this.DAMPENING_MS = options.dampeningMs || 60;
    this.lastAuditLatencyMs = 0;
    this.keyboardOffset = 0;
    this.isKeyboardOpen = false;
    this.spillDetected = false;

    if (typeof window !== 'undefined' && !options.skipAutoInit) {
      this.initSensors();
    }
  }

  initSensors() {
    if (typeof window === 'undefined') return;

    // 1. Visual Viewport Sensor (Real-time virtual keyboard & dynamic address bar tracker)
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', () => this.handleViewportChange(), { passive: true });
      window.visualViewport.addEventListener('scroll', () => this.handleViewportChange(), { passive: true });
    }

    // 2. Hardware Window Dimension & Orientation Sensors
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => this.scheduleLayoutAudit(), { passive: true });
      window.addEventListener('orientationchange', () => this.scheduleLayoutAudit(), { passive: true });
    }

    // 3. Document Readiness Hook
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => this.scheduleLayoutAudit(), { once: true });
      } else {
        this.scheduleLayoutAudit();
      }
    }
  }

  scheduleLayoutAudit() {
    if (this.mutationLock || this.circuitBreakerTripped) return;

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => this.auditAndCorrect());
    } else {
      this.auditAndCorrect();
    }
  }

  handleViewportChange() {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const winH = window.innerHeight;
    const vvH = window.visualViewport.height;
    const keyboardHeight = Math.max(0, winH - vvH);
    const isOpen = keyboardHeight > 120;

    this.keyboardOffset = isOpen ? Math.round(keyboardHeight) : 0;
    this.isKeyboardOpen = isOpen;

    const targetEl = document.documentElement || document.body;
    if (targetEl && targetEl.style && typeof targetEl.style.setProperty === 'function') {
      targetEl.style.setProperty('--v-keyboard-offset', `${this.keyboardOffset}px`);
    }
    if (document.body && typeof document.body.setAttribute === 'function') {
      document.body.setAttribute('data-keyboard-open', isOpen ? 'true' : 'false');
    }

    // Auto-scroll active input into center view if keyboard elevated
    if (isOpen && document.activeElement) {
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        try {
          document.activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (_) {
          // Fallback if smooth scrolling is unsupported
          document.activeElement.scrollIntoView();
        }
      }
    }
  }

  classifyTier(width, height) {
    if (width < 380) {
      return 'mobile-compact';
    } else if (width < 600) {
      return 'mobile';
    } else if (width <= 1024) {
      return (height > width) ? 'tablet-portrait' : 'tablet-landscape';
    } else {
      return 'desktop';
    }
  }

  auditAndCorrect() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // Check circuit breaker sliding window (limit rapid consecutive reflows)
    const now = Date.now();
    this.mutationTimestamps = this.mutationTimestamps.filter(t => now - t < 1000);
    if (this.mutationTimestamps.length >= this.MAX_MUTATIONS_PER_SEC) {
      this.circuitBreakerTripped = true;
      console.warn(`[RamanUiAgent] Circuit breaker tripped! Layout mutation frequency exceeded ${this.MAX_MUTATIONS_PER_SEC}/s.`);
      return;
    }

    this.mutationLock = true;
    this.totalAudits++;

    // --- PHASE 1: PURE GEOMETRIC READ (NO DOM MUTATIONS) ---
    const w = window.innerWidth || (document.documentElement ? document.documentElement.clientWidth : 1024);
    const h = window.innerHeight || (document.documentElement ? document.documentElement.clientHeight : 768);
    const docEl = document.documentElement;
    const bodyEl = document.body;
    const scrollW = Math.max(docEl ? docEl.scrollWidth : 0, bodyEl ? bodyEl.scrollWidth : 0, w);
    let hasSpill = scrollW > (w + 1);

    const candidatesToContain = [];
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const candidates = document.querySelectorAll(
        '.chat-messages, .consultation-card, .vitals-grid, .hud-canvas-container, .anatomical-scanner-card, .chat-area, .sidebar'
      );
      for (let i = 0; i < candidates.length; i++) {
        const sw = candidates[i].scrollWidth;
        if (sw > (w + 1)) {
          hasSpill = true;
          candidatesToContain.push(candidates[i]);
        }
      }
    }

    // Read canvas dimensions before ANY mutation to prevent forced reflow
    const canvasesToResync = [];
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const canvases = document.querySelectorAll('canvas[data-auto-resync="true"]');
      const dpr = window.devicePixelRatio || 1;
      for (let i = 0; i < canvases.length; i++) {
        const cvs = canvases[i];
        const clientW = cvs.clientWidth;
        const clientH = cvs.clientHeight;
        if (clientW > 0 && clientH > 0) {
          const targetW = Math.round(clientW * dpr);
          const targetH = Math.round(clientH * dpr);
          if (cvs.width !== targetW || cvs.height !== targetH) {
            canvasesToResync.push({ cvs, targetW, targetH });
          }
        }
      }
    }

    // --- PHASE 2: TIER CLASSIFICATION & DECISION ---
    const tier = this.classifyTier(w, h);
    let mutated = false;

    // --- PHASE 3: BATCHED DECLARATIVE MUTATION (WRITE ONLY) ---
    if (document.body) {
      if (this.lastTier !== tier) {
        document.body.setAttribute('data-ui-tier', tier);
        this.lastTier = tier;
        mutated = true;
      }

      const prevSpill = document.body.getAttribute('data-spill-detected') === 'true';
      if (prevSpill !== hasSpill) {
        document.body.setAttribute('data-spill-detected', hasSpill ? 'true' : 'false');
        mutated = true;
      }

      // Configure touch target sizing property on document root (idempotent write)
      const rootEl = docEl || document.body;
      if (rootEl && rootEl.style && typeof rootEl.style.setProperty === 'function') {
        const currentTargetMin = (typeof rootEl.style.getPropertyValue === 'function')
          ? rootEl.style.getPropertyValue('--ui-touch-target-min')
          : rootEl.style['--ui-touch-target-min'];
        const expectedTargetMin = this.isTouch ? '44px' : '32px';
        if (currentTargetMin !== expectedTargetMin) {
          rootEl.style.setProperty('--ui-touch-target-min', expectedTargetMin);
          mutated = true;
        }
      }
      if (document.body && typeof document.body.setAttribute === 'function') {
        const currentPointer = document.body.getAttribute('data-pointer-type');
        const expectedPointer = this.isTouch ? 'touch' : 'fine';
        if (currentPointer !== expectedPointer) {
          document.body.setAttribute('data-pointer-type', expectedPointer);
          mutated = true;
        }
      }
    }

    this.spillDetected = hasSpill;

    // Self-healing horizontal overflow containment
    if (candidatesToContain.length > 0) {
      for (let i = 0; i < candidatesToContain.length; i++) {
        const el = candidatesToContain[i];
        el.style.maxWidth = '100%';
        el.style.boxSizing = 'border-box';
        el.style.overflowX = 'auto';
        el.style.webkitOverflowScrolling = 'touch';
      }
      mutated = true;
    }

    // Apply High-DPI Canvas Buffer Synchronization
    if (canvasesToResync.length > 0) {
      for (let i = 0; i < canvasesToResync.length; i++) {
        const item = canvasesToResync[i];
        item.cvs.width = item.targetW;
        item.cvs.height = item.targetH;
      }
      mutated = true;
    }

    if (mutated) {
      this.totalCorrections++;
      this.mutationTimestamps.push(now);
    }

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.lastAuditLatencyMs = Math.round((t1 - t0) * 1000) / 1000;

    // Release dampening lock after interval
    setTimeout(() => {
      this.mutationLock = false;
    }, this.DAMPENING_MS);
  }

  containSpillElements() {
    if (typeof document === 'undefined') return;

    const candidates = document.querySelectorAll(
      '.chat-messages, .consultation-card, .vitals-grid, .hud-canvas-container, .anatomical-scanner-card, .chat-area, .sidebar'
    );
    const winW = window.innerWidth || 360;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.scrollWidth > winW) {
        el.style.maxWidth = '100%';
        el.style.boxSizing = 'border-box';
        el.style.overflowX = 'auto';
        el.style.webkitOverflowScrolling = 'touch';
      }
    }
  }

  syncCanvases() {
    if (typeof document === 'undefined') return;

    const canvases = document.querySelectorAll('canvas[data-auto-resync="true"]');
    const dpr = window.devicePixelRatio || 1;

    for (let i = 0; i < canvases.length; i++) {
      const cvs = canvases[i];
      const clientW = cvs.clientWidth;
      const clientH = cvs.clientHeight;

      if (clientW > 0 && clientH > 0) {
        const targetW = Math.round(clientW * dpr);
        const targetH = Math.round(clientH * dpr);

        if (cvs.width !== targetW || cvs.height !== targetH) {
          cvs.width = targetW;
          cvs.height = targetH;
        }
      }
    }
  }

  resetCircuitBreaker() {
    this.circuitBreakerTripped = false;
    this.mutationTimestamps = [];
    this.mutationLock = false;
  }

  getDiagnostics() {
    const w = (typeof window !== 'undefined') ? window.innerWidth : 0;
    const h = (typeof window !== 'undefined') ? window.innerHeight : 0;
    const vv = (typeof window !== 'undefined' && window.visualViewport) ? window.visualViewport : { width: w, height: h };
    const dpr = (typeof window !== 'undefined') ? (window.devicePixelRatio || 1) : 1;

    return {
      version: this.version,
      activeTier: this.lastTier || this.classifyTier(w, h),
      viewport: {
        width: w,
        height: h,
        visualWidth: vv.width,
        visualHeight: vv.height,
        devicePixelRatio: dpr
      },
      keyboard: {
        isOpen: this.isKeyboardOpen,
        offsetPx: this.keyboardOffset
      },
      spillDetected: this.spillDetected,
      touchEnabled: this.isTouch,
      totalAudits: this.totalAudits,
      totalCorrections: this.totalCorrections,
      circuitBreakerTripped: this.circuitBreakerTripped,
      executionLatencyMs: this.lastAuditLatencyMs
    };
  }
}

// Global browser singleton
if (typeof window !== 'undefined') {
  window.RamanUiAgent = RamanUiAgent;
  if (!window.ramanUiAgent) {
    window.ramanUiAgent = new RamanUiAgent();
  }
}

// CommonJS export for Node.js test runners
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RamanUiAgent };
}
