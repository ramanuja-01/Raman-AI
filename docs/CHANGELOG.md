# 📜 RAMAN AI – Changelog & Versioning History
### *Experiment No. 170: Offline Client-Side Diagnostic Sandbox*

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Refer to the primary root [`CHANGELOG.md`](file:///C:/raman_ai/CHANGELOG.md) for full historical release notes and upcoming roadmap milestones.

---

## [2.3.0] – 2026-11-02 (Autonomous Real-Time UI Responsiveness & Self-Healing Agent)
- Added `ui_responsive_agent.js` providing real-time client-side display tier categorization across Desktop, Tablet, and Mobile.
- Virtual keyboard dynamic encroachment compensation via `window.visualViewport` exposing `--v-keyboard-offset` and `data-keyboard-open`.
- Self-healing horizontal overflow containment and high-DPI canvas buffer synchronization (`data-auto-resync="true"`).
- Non-polling observer engine with circuit breaker rate limiting (max 5 mutations/s).
- Full documentation suite: PRD, TRD, SRS, Guidelines & Restrictions, Security Architecture, Implementation Plan.
- 34/34 passing test suites in `test_slm.js`, 24 Playwright E2E tests in `tests/ui_responsive_agent.spec.js`, and all 3 system audit gates verified.