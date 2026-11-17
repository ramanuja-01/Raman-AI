const { chromium } = require('@playwright/test');
const { loadRamanApp } = require('../tests/helpers');
const fs = require('fs');

async function runAudit() {
  console.log('--- STARTING COMPREHENSIVE MOBILE UI RECON & AUDIT ---');

  const browser = await chromium.launch({ headless: true });
  
  const testProfiles = [
    { name: 'Pixel 7', viewport: { width: 412, height: 915 } },
    { name: 'iPhone 14', viewport: { width: 390, height: 844 } },
    { name: 'Compact Android (360x640)', viewport: { width: 360, height: 640 } },
    { name: 'Ultra-Compact (320x568)', viewport: { width: 320, height: 568 } },
    { name: 'Mobile Landscape (667x375)', viewport: { width: 667, height: 375 } }
  ];

  const results = {};

  for (const profile of testProfiles) {
    console.log(`\n========================================`);
    console.log(`TESTING VIEWPORT: ${profile.name} (${profile.viewport.width}x${profile.viewport.height})`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: true,
      hasTouch: true,
      baseURL: 'http://127.0.0.1:3456'
    });

    const page = await context.newPage();
    await loadRamanApp(page);

    const issues = [];

    // Helper: detect horizontal spillages
    async function checkSpills(contextLabel) {
      const spills = await page.evaluate((label) => {
        const found = [];
        const winW = window.innerWidth;
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
          
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          
          // Check if element spills outside viewport boundary
          if (rect.right > winW + 2 && !['HTML', 'BODY'].includes(el.tagName)) {
            let parent = el.parentElement;
            let clipped = false;
            while (parent && parent !== document.body) {
              const pStyle = window.getComputedStyle(parent);
              if (pStyle.overflowX === 'hidden' || pStyle.overflowX === 'auto' || pStyle.overflowX === 'scroll') {
                clipped = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (!clipped) {
              found.push({
                tag: el.tagName,
                id: el.id || '',
                className: (typeof el.className === 'string' ? el.className.slice(0, 50) : ''),
                width: Math.round(rect.width),
                right: Math.round(rect.right),
                viewportWidth: winW,
                overflowPx: Math.round(rect.right - winW)
              });
            }
          }
        }
        return found;
      }, contextLabel);

      if (spills.length > 0) {
        issues.push({
          type: 'HORIZONTAL_OVERFLOW_SPILL',
          context: contextLabel,
          details: spills.slice(0, 8)
        });
      }
    }

    // 1. Check Initial Consult View Spills
    await checkSpills('Consult Tab (Default)');

    // 2. Check Tap Target Sizes on Interactive Elements in Consult View
    const smallTargets = await page.evaluate(() => {
      const bad = [];
      const interactives = document.querySelectorAll('button, a, input, select, textarea, .nav-tab-btn, .organ-chip, .symptom-tag, .media-btn, [role="button"]');
      for (const el of interactives) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        if (rect.width < 44 || rect.height < 44) {
          bad.push({
            id: el.id,
            className: typeof el.className === 'string' ? el.className.trim().slice(0, 40) : '',
            tag: el.tagName,
            text: el.innerText ? el.innerText.slice(0, 20).trim() : el.getAttribute('aria-label') || '',
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        }
      }
      return bad;
    });

    if (smallTargets.length > 0) {
      issues.push({
        type: 'UNDERSIZED_TAP_TARGETS (<44px)',
        count: smallTargets.length,
        samples: smallTargets.slice(0, 10)
      });
    }

    // 3. Header single-row & overflow check
    const headerInfo = await page.evaluate(() => {
      const header = document.querySelector('.app-header');
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      const title = document.querySelector('.header-title');
      const titleRect = title ? title.getBoundingClientRect() : null;
      return {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        scrollWidth: header.scrollWidth,
        titleWidth: titleRect ? Math.round(titleRect.width) : 0,
        isOverflowing: header.scrollWidth > rect.width + 1
      };
    });

    if (headerInfo && (headerInfo.height > 58 || headerInfo.isOverflowing)) {
      issues.push({
        type: 'HEADER_OVERFLOW_OR_WRAPPING',
        info: headerInfo
      });
    }

    // 4. Test Tab Switching and Spills on Anatomy, Vault, Profile
    const tabs = [
      { id: '#navBtnAnatomy', name: 'Anatomy Tab' },
      { id: '#navBtnVault', name: 'Vault Tab' },
      { id: '#navBtnProfile', name: 'Profile Tab' },
      { id: '#navBtnConsult', name: 'Consult Tab (Return)' }
    ];

    for (const tab of tabs) {
      const btn = page.locator(tab.id);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(200);
        await checkSpills(tab.name);
      }
    }

    // 5. Test Modals: Opening, Off-screen Transform, Spills
    const modalsToTest = [
      { name: 'Mobile Quick Controls', trigger: () => page.click('#btnMobileControls'), close: () => page.click('#mobileControlSheet .sheet-close-btn'), selector: '#mobileControlSheet' },
      { name: 'Multimodal Hub Modal', trigger: () => page.evaluate(() => window.openMultimodalHub && window.openMultimodalHub()), close: () => page.evaluate(() => window.closeMultimodalHub && window.closeMultimodalHub()), selector: '#multimodalHubModal' },
      { name: 'SLM Training Hub Modal', trigger: () => page.evaluate(() => window.openTrainingHub && window.openTrainingHub()), close: () => page.click('#trainingHubModal .sp-close'), selector: '#trainingHubModal' },
      { name: 'Clinical Dictionary Modal', trigger: () => page.evaluate(() => window.openClinicalDictModal && window.openClinicalDictModal()), close: () => page.click('#clinicalDictModal .sp-close'), selector: '#clinicalDictModal' },
      { name: 'Session Manager Panel', trigger: () => page.evaluate(() => window.toggleSessionPanel && window.toggleSessionPanel()), close: () => page.evaluate(() => window.closeSessionPanel && window.closeSessionPanel()), selector: '#sessionPanel' },
      { name: 'API Settings Modal', trigger: () => page.evaluate(() => window.openApiSettings && window.openApiSettings()), close: () => page.evaluate(() => window.closeApiSettings && window.closeApiSettings()), selector: '#apiSettingsModal' },
      { name: 'Help/Wiki Modal', trigger: () => page.evaluate(() => window.openTutorial && window.openTutorial()), close: () => page.evaluate(() => window.closeTutorial && window.closeTutorial()), selector: '#tutorialModal' }
    ];

    for (const m of modalsToTest) {
      try {
        await m.trigger();
        await page.waitForTimeout(200);

        const modalState = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { exists: false };
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const winH = window.innerHeight;
          const winW = window.innerWidth;
          
          return {
            exists: true,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            transform: style.transform,
            rect: {
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            viewportH: winH,
            viewportW: winW,
            isCompletelyOffscreen: rect.top >= winH || rect.bottom <= 0 || rect.left >= winW || rect.right <= 0,
            hasHorizontalSpill: el.scrollWidth > el.clientWidth + 2
          };
        }, m.selector);

        if (!modalState.exists) {
          issues.push({ type: 'MODAL_NOT_FOUND', modal: m.name });
        } else if (modalState.isCompletelyOffscreen) {
          issues.push({
            type: 'MODAL_OFFSCREEN_DEFECT',
            modal: m.name,
            reason: `Modal opened but is placed off-screen! transform=${modalState.transform}, top=${modalState.rect.top}, viewportH=${modalState.viewportH}`,
            state: modalState
          });
        } else if (modalState.hasHorizontalSpill) {
          issues.push({
            type: 'MODAL_CONTENT_HORIZONTAL_SPILL',
            modal: m.name,
            state: modalState
          });
        }

        await m.close();
        await page.waitForTimeout(150);
      } catch (err) {
        issues.push({ type: 'MODAL_TEST_ERROR', modal: m.name, error: err.message });
      }
    }

    // 6. Test Virtual Keyboard Simulation (Visual Viewport shrinkage)
    const keyboardTest = await page.evaluate(() => {
      if (!window.ramanUiAgent) return { error: 'No ramanUiAgent' };
      
      const origVv = window.visualViewport;
      const initialChatInput = document.querySelector('.chat-input-area');
      const initialBottomNav = document.querySelector('#mobileBottomNav');
      const initialRect = initialChatInput ? initialChatInput.getBoundingClientRect() : null;

      // Simulate soft keyboard taking 300px at bottom
      window.visualViewport = {
        width: window.innerWidth,
        height: window.innerHeight - 300
      };
      window.ramanUiAgent.handleViewportChange();

      const kbOpenAttr = document.body.getAttribute('data-keyboard-open');
      const postVvRect = initialChatInput ? initialChatInput.getBoundingClientRect() : null;
      const postNavStyle = initialBottomNav ? window.getComputedStyle(initialBottomNav) : null;

      // Restore
      window.visualViewport = origVv;
      window.ramanUiAgent.handleViewportChange();

      return {
        keyboardOpenAttribute: kbOpenAttr,
        inputAreaBottomBefore: initialRect ? Math.round(initialRect.bottom) : 0,
        inputAreaBottomAfter: postVvRect ? Math.round(postVvRect.bottom) : 0,
        viewportHeightReduced: window.innerHeight - 300,
        isInputAreaCoveredByKeyboard: postVvRect ? (postVvRect.bottom > (window.innerHeight - 300)) : false,
        bottomNavDisplay: postNavStyle ? postNavStyle.display : null
      };
    });

    if (keyboardTest.isInputAreaCoveredByKeyboard) {
      issues.push({
        type: 'KEYBOARD_OBSCURES_INPUT_DECK',
        details: keyboardTest
      });
    }

    results[profile.name] = issues;
    console.log(`Issues detected on ${profile.name}: ${issues.length}`);
    for (const iss of issues) {
      console.log(`  - [${iss.type}] ${iss.modal || iss.context || ''}: ${iss.reason || JSON.stringify(iss.details || iss.samples || iss.info || '')}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\n--- AUDIT COMPLETED SUCCESSFULLY ---');
  return results;
}

runAudit().then(res => {
  fs.writeFileSync('docs/mobile_recon_audit.json', JSON.stringify(res, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
