const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');
const fs = require('fs');
const path = require('path');

const auditLog = [];

function recordFinding(category, title, severity, details) {
  const finding = { category, title, severity, details };
  auditLog.push(finding);
  console.log(`[AUDIT - ${severity}] ${category}: ${title}`);
}

test.describe('Comprehensive Mobile UI Reconnaissance & Study', () => {

  test.afterAll(() => {
    try {
      const outPath = path.resolve(__dirname, '../docs/mobile_recon_findings.json');
      fs.writeFileSync(outPath, JSON.stringify(auditLog, null, 2));
      console.log(`Saved ${auditLog.length} mobile audit findings to docs/mobile_recon_findings.json`);
    } catch (e) {
      console.error('Failed to write findings:', e);
    }
  });

  test('Recon 1: Header layout & overflow across 320px, 360px, 390px, 412px', async ({ page }) => {
    test.setTimeout(90000);
    const widths = [412, 390, 360, 320];

    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 750 });
      await loadRamanApp(page);

      const headerState = await page.evaluate((width) => {
        const header = document.querySelector('.app-header');
        if (!header) return null;
        const rect = header.getBoundingClientRect();
        const docScrollW = document.documentElement.scrollWidth;
        const bodyScrollW = document.body.scrollWidth;
        const titleEl = document.querySelector('.header-title');
        const titleRect = titleEl ? titleEl.getBoundingClientRect() : null;
        const controlsBtn = document.querySelector('#btnMobileControls');
        const controlsRect = controlsBtn ? controlsBtn.getBoundingClientRect() : null;

        return {
          viewportW: width,
          headerHeight: Math.round(rect.height),
          headerScrollW: header.scrollWidth,
          headerClientW: header.clientWidth,
          hasHeaderOverflow: header.scrollWidth > header.clientWidth + 1,
          docScrollW,
          bodyScrollW,
          hasDocOverflow: docScrollW > width + 1 || bodyScrollW > width + 1,
          titleText: titleEl ? titleEl.textContent.trim() : '',
          titleWidth: titleRect ? Math.round(titleRect.width) : 0,
          controlsBtnWidth: controlsRect ? Math.round(controlsRect.width) : 0,
          controlsBtnText: controlsBtn ? controlsBtn.textContent.trim() : ''
        };
      }, w);

      if (headerState.hasHeaderOverflow || headerState.hasDocOverflow || headerState.headerHeight > 54) {
        recordFinding('HEADER', `Header overflow or height violation at ${w}px`, 'HIGH', headerState);
      } else {
        recordFinding('HEADER', `Header fits cleanly at ${w}px`, 'INFO', headerState);
      }
    }
  });

  test('Recon 2: Undersized Tap Targets (<44px WCAG 2.1 AA) in Mobile Consult View', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const badTargets = await page.evaluate(() => {
      const results = [];
      const interactives = document.querySelectorAll(
        'button, a, input, select, textarea, .nav-tab-btn, .organ-chip, .symptom-tag, .media-btn, .btn-send, #btnThemeToggle, #btnMobileControls'
      );

      for (const el of interactives) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // inside viewport or within interactive reach
        if (rect.top > window.innerHeight + 100 || rect.bottom < -100) continue;

        if (rect.width < 44 || rect.height < 44) {
          results.push({
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className.trim() : '',
            tag: el.tagName,
            text: (el.innerText || el.getAttribute('aria-label') || el.value || '').slice(0, 30).trim(),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        }
      }
      return results;
    });

    if (badTargets.length > 0) {
      recordFinding('TOUCH_TARGETS', `Found ${badTargets.length} undersized interactive elements (<44px)`, 'HIGH', badTargets);
    } else {
      recordFinding('TOUCH_TARGETS', 'All visible interactive targets meet WCAG 44px min tap requirement', 'INFO', {});
    }
  });

  test('Recon 3: Virtual keyboard elevation and input deck behavior', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const kbAnalysis = await page.evaluate(() => {
      if (!window.ramanUiAgent) return { error: 'ramanUiAgent not loaded' };

      const winH = window.innerHeight;
      const winW = window.innerWidth;
      const inputBar = document.querySelector('.chat-input-area');
      const bottomNav = document.querySelector('#mobileBottomNav');
      const textarea = document.querySelector('#userInput');
      
      const beforeRect = inputBar ? inputBar.getBoundingClientRect() : null;

      // Simulate soft keyboard taking 300px of height
      const keyboardH = 300;
      window.visualViewport = {
        width: winW,
        height: winH - keyboardH
      };
      window.ramanUiAgent.handleViewportChange();

      const afterRect = inputBar ? inputBar.getBoundingClientRect() : null;
      const afterNavStyle = bottomNav ? window.getComputedStyle(bottomNav) : null;
      const afterNavRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
      const bodyKbAttr = document.body.getAttribute('data-keyboard-open');

      const isInputCovered = afterRect ? (afterRect.bottom > (winH - keyboardH)) : true;
      const isNavVisibleDuringTyping = afterNavStyle && afterNavStyle.display !== 'none' && afterNavRect && afterNavRect.height > 0;

      // Restore
      window.visualViewport = { width: winW, height: winH };
      window.ramanUiAgent.handleViewportChange();

      return {
        viewportH: winH,
        keyboardH,
        activeVisualH: winH - keyboardH,
        inputAreaBottomBefore: beforeRect ? Math.round(beforeRect.bottom) : 0,
        inputAreaBottomAfter: afterRect ? Math.round(afterRect.bottom) : 0,
        isInputCovered,
        bodyKbAttr,
        isNavVisibleDuringTyping,
        navBottomAfter: afterNavRect ? Math.round(afterNavRect.bottom) : 0
      };
    });

    if (kbAnalysis.isInputCovered) {
      recordFinding(
        'VIRTUAL_KEYBOARD',
        'Virtual keyboard covers input deck! User cannot see typed text or send button',
        'CRITICAL',
        kbAnalysis
      );
    } else {
      recordFinding('VIRTUAL_KEYBOARD', 'Input deck adjusts cleanly above virtual keyboard', 'INFO', kbAnalysis);
    }

    if (kbAnalysis.isNavVisibleDuringTyping) {
      recordFinding(
        'VIRTUAL_KEYBOARD',
        'Bottom navigation remains displayed or misaligned when keyboard is active, wasting vertical space',
        'MEDIUM',
        kbAnalysis
      );
    }
  });

  test('Recon 4: Modals visibility and Bottom Sheet transformation study', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const modals = [
      { name: 'Multimodal Hub Modal', open: () => window.openMultimodalHub && window.openMultimodalHub(), close: () => window.closeMultimodalHub && window.closeMultimodalHub(), sel: '#multimodalHubModal' },
      { name: 'SLM Training Hub Modal', open: () => window.openTrainingHub && window.openTrainingHub(), close: () => window.closeTrainingHub && window.closeTrainingHub(), sel: '#trainingHubModal' },
      { name: 'Clinical Dictionary Modal', open: () => window.openClinicalDictModal && window.openClinicalDictModal(), close: () => window.closeClinicalDictModal && window.closeClinicalDictModal(), sel: '#clinicalDictModal' },
      { name: 'Session Manager Panel', open: () => window.toggleSessionPanel && window.toggleSessionPanel(), close: () => window.closeSessionPanel && window.closeSessionPanel(), sel: '#sessionPanel' },
      { name: 'API Settings Modal', open: () => window.openApiSettings && window.openApiSettings(), close: () => window.closeApiSettings && window.closeApiSettings(), sel: '#apiSettingsModal' },
      { name: 'Help/Wiki Modal', open: () => window.openTutorial && window.openTutorial(), close: () => window.closeTutorial && window.closeTutorial(), sel: '#tutorialModal' },
      { name: 'Mobile Quick Controls Sheet', open: () => { const b = document.getElementById('btnMobileControls'); if(b) b.click(); }, close: () => window.closeMobileControlSheet && window.closeMobileControlSheet(), sel: '#mobileControlSheet' }
    ];

    for (const m of modals) {
      await page.evaluate(m.open);
      await page.waitForTimeout(200);

      const state = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { exists: false };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const winH = window.innerHeight;
        const winW = window.innerWidth;

        // Check if translated offscreen
        const isOffscreen = rect.top >= winH || rect.bottom <= 0 || rect.left >= winW || rect.right <= 0;
        const hasSpill = el.scrollWidth > el.clientWidth + 2;

        // Check inner column layout (e.g. grids that might fail to stack)
        const innerGrids = [];
        const grids = el.querySelectorAll('[style*="grid-template-columns"]');
        for (const g of grids) {
          const gStyle = window.getComputedStyle(g);
          const gRect = g.getBoundingClientRect();
          innerGrids.push({
            gridCols: gStyle.gridTemplateColumns,
            width: Math.round(gRect.width),
            scrollW: g.scrollWidth,
            isOverflowing: g.scrollWidth > gRect.width + 1
          });
        }

        return {
          exists: true,
          display: style.display,
          transform: style.transform,
          rect: {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          isOffscreen,
          hasSpill,
          innerGrids
        };
      }, m.sel);

      if (!state.exists) {
        recordFinding('MODALS', `Modal not found: ${m.name}`, 'HIGH', { modal: m.name });
      } else if (state.isOffscreen) {
        recordFinding(
          'MODALS',
          `DEFECT: Modal opened but is positioned offscreen (hidden from user!): ${m.name}`,
          'CRITICAL',
          { modal: m.name, state }
        );
      } else if (state.hasSpill) {
        recordFinding(
          'MODALS',
          `Horizontal spill inside modal: ${m.name}`,
          'HIGH',
          { modal: m.name, state }
        );
      } else {
        recordFinding('MODALS', `Modal opens and transforms cleanly: ${m.name}`, 'INFO', { modal: m.name, state });
      }

      await page.evaluate(m.close);
      await page.waitForTimeout(150);
    }
  });

  test('Recon 5: Study All Tabs (Consult, Anatomy, Vault, Profile) for Overflows and Clutters', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const tabs = [
      { name: 'Consult', btn: '#navBtnConsult' },
      { name: 'Anatomy', btn: '#navBtnAnatomy' },
      { name: 'Vault', btn: '#navBtnVault' },
      { name: 'Profile', btn: '#navBtnProfile' }
    ];

    for (const t of tabs) {
      await page.click(t.btn);
      await page.waitForTimeout(200);

      const tabAudit = await page.evaluate((tabName) => {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const docScrollW = document.documentElement.scrollWidth;
        const bodyScrollW = document.body.scrollWidth;

        const spills = [];
        const all = document.querySelectorAll('.sidebar, .chat-area, .sidebar-section, .med-section, .anatomical-scanner-card, .vitals-grid');
        for (const el of all) {
          if (el.scrollWidth > el.clientWidth + 2) {
            spills.push({
              className: el.className,
              id: el.id,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              overflow: el.scrollWidth - el.clientWidth
            });
          }
        }

        return {
          tab: tabName,
          hasDocumentSpill: docScrollW > winW + 1 || bodyScrollW > winW + 1,
          docScrollW,
          winW,
          spills
        };
      }, t.name);

      if (tabAudit.hasDocumentSpill || tabAudit.spills.length > 0) {
        recordFinding('TAB_LAYOUT', `Overflow/Spill detected on ${t.name} tab`, 'HIGH', tabAudit);
      } else {
        recordFinding('TAB_LAYOUT', `${t.name} tab layout fits viewport cleanly`, 'INFO', tabAudit);
      }
    }
  });

});
