const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Mobile Optimization Enhancements Verification', () => {

  test('Verification 1: Input deck lifts cleanly and bottom nav hides when virtual keyboard opens', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const result = await page.evaluate(() => {
      const winH = window.innerHeight;
      const winW = window.innerWidth;
      const bottomNav = document.getElementById('mobileBottomNav');
      const inputArea = document.querySelector('.chat-input-area');

      // Simulate soft keyboard raising by 300px
      const keyboardH = 300;
      const originalVv = window.visualViewport;
      window.visualViewport = {
        width: winW,
        height: winH - keyboardH
      };
      if (window.ramanUiAgent) {
        window.ramanUiAgent.handleViewportChange();
      }

      // Read active computed styles WHILE keyboard is open
      const navDisplay = bottomNav ? window.getComputedStyle(bottomNav).display : null;
      const inputRect = inputArea ? inputArea.getBoundingClientRect() : null;
      const isInputWithinVisibleViewport = inputRect ? (inputRect.bottom <= (winH - keyboardH + 10)) : false;

      // Restore
      window.visualViewport = originalVv;
      if (window.ramanUiAgent) {
        window.ramanUiAgent.handleViewportChange();
      }

      return {
        navDisplay,
        isInputWithinVisibleViewport
      };
    });

    // When typing on mobile, bottom nav MUST hide to give screen to the conversation
    expect(result.navDisplay).toBe('none');
    // Input area MUST be within the visible viewport (not covered by keyboard)
    expect(result.isInputWithinVisibleViewport).toBe(true);
  });

  test('Verification 2: Multimodal Hub & Clinical Dictionary Modals transform to visible bottom sheets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    // 1. Multimodal Hub Modal
    await page.evaluate(() => window.openMultimodalHub && window.openMultimodalHub());
    await page.waitForTimeout(200);

    const mmModal = page.locator('#multimodalHubModal');
    await expect(mmModal).toHaveClass(/open/);
    await expect(mmModal).toBeVisible();

    const mmBox = await mmModal.boundingBox();
    expect(mmBox).not.toBeNull();
    // Modal top must be on-screen
    expect(mmBox.y).toBeGreaterThanOrEqual(0);
    expect(mmBox.y).toBeLessThan(page.viewportSize().height);

    await page.evaluate(() => window.closeMultimodalHub && window.closeMultimodalHub());
    await page.waitForTimeout(150);

    // 2. Clinical Dictionary Modal
    await page.evaluate(() => window.openClinicalDictModal && window.openClinicalDictModal('paracetamol'));
    await page.waitForTimeout(200);

    const dictModal = page.locator('#clinicalDictModal');
    await expect(dictModal).toHaveClass(/open/);
    await expect(dictModal).toBeVisible();

    const termName = page.locator('#dictTermName');
    await expect(termName).toHaveText(/Paracetamol/);

    const dictBox = await dictModal.boundingBox();
    expect(dictBox).not.toBeNull();
    expect(dictBox.y).toBeGreaterThanOrEqual(0);
    expect(dictBox.y).toBeLessThan(page.viewportSize().height);

    await page.evaluate(() => window.closeClinicalDictModal && window.closeClinicalDictModal());
  });

  test('Verification 3: Primary interactive controls satisfy WCAG 2.1 AA >= 44x44px tap target size', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    // Check Send Button
    const sendBtn = page.locator('#btnSend');
    await expect(sendBtn).toBeVisible();
    const sendBox = await sendBtn.boundingBox();
    expect(sendBox.width).toBeGreaterThanOrEqual(44);
    expect(sendBox.height).toBeGreaterThanOrEqual(44);

    // Check Media Buttons
    const cameraBtn = page.locator('#btnCamera');
    await expect(cameraBtn).toBeVisible();
    const cameraBox = await cameraBtn.boundingBox();
    expect(cameraBox.width).toBeGreaterThanOrEqual(44);
    expect(cameraBox.height).toBeGreaterThanOrEqual(44);

    // Check Theme Toggle
    const themeBtn = page.locator('#btnThemeToggle');
    await expect(themeBtn).toBeVisible();
    const themeBox = await themeBtn.boundingBox();
    expect(themeBox.width).toBeGreaterThanOrEqual(44);
    expect(themeBox.height).toBeGreaterThanOrEqual(44);

    // Check Mobile Controls Button
    const controlsBtn = page.locator('#btnMobileControls');
    await expect(controlsBtn).toBeVisible();
    const controlsBox = await controlsBtn.boundingBox();
    expect(controlsBox.height).toBeGreaterThanOrEqual(44);

    // Check Sheet Close Button
    await controlsBtn.click();
    const sheetCloseBtn = page.locator('#mobileControlSheet .sheet-close-btn');
    await expect(sheetCloseBtn).toBeVisible();
    const closeBox = await sheetCloseBtn.boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    await sheetCloseBtn.click();
  });

  test('Verification 4: Native touch swipe gesture navigates between mobile tabs', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    // Starts on 'consult'
    let currentTab = await page.evaluate(() => document.body.getAttribute('data-active-tab'));
    expect(currentTab).toBe('consult');

    // Simulate touch swipe left: from x=280 to x=80 on chat-messages
    const chatContainer = page.locator('.chat-messages');
    const box = await chatContainer.boundingBox();
    expect(box).not.toBeNull();

    const startX = box.x + box.width * 0.75;
    const endX = box.x + box.width * 0.25;
    const centerY = box.y + box.height / 2;

    await page.touchscreen.tap(startX, centerY); // initial touch
    await page.evaluate(({ sx, ex, y }) => {
      const container = document.getElementById('appContainer') || document.body;
      const touchStart = new Touch({
        identifier: Date.now(),
        target: container,
        clientX: sx,
        clientY: y
      });
      const touchEnd = new Touch({
        identifier: Date.now(),
        target: container,
        clientX: ex,
        clientY: y
      });

      const startEvt = new TouchEvent('touchstart', {
        touches: [touchStart],
        changedTouches: [touchStart],
        bubbles: true
      });
      const endEvt = new TouchEvent('touchend', {
        touches: [],
        changedTouches: [touchEnd],
        bubbles: true
      });

      container.dispatchEvent(startEvt);
      container.dispatchEvent(endEvt);
    }, { sx: startX, ex: endX, y: centerY });

    // Should have transitioned to anatomy tab
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'anatomy', { timeout: 5000 });
  });

  test('Verification 5: Secondary modals (ZKP, Hybrid Search, Clinician Override) render as bottom sheets with touch targets >= 44px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const vp = page.viewportSize();

    // 1. ZKP Modal
    await page.evaluate(() => window.openZkpModal && window.openZkpModal());
    await page.waitForTimeout(200);

    const zkpModal = page.locator('#zkpModal');
    await expect(zkpModal).toBeVisible();

    const zkpDialog = page.locator('#zkpModal .zkp-modal-dialog');
    const zkpBox = await zkpDialog.boundingBox();
    expect(zkpBox).not.toBeNull();
    expect(zkpBox.y).toBeGreaterThanOrEqual(0);
    expect(zkpBox.y + zkpBox.height).toBeLessThanOrEqual(vp.height + 5);

    const zkpClose = page.locator('#zkpModal .sheet-close-btn');
    const zkpCloseBox = await zkpClose.boundingBox();
    expect(zkpCloseBox.width).toBeGreaterThanOrEqual(44);
    expect(zkpCloseBox.height).toBeGreaterThanOrEqual(44);
    await zkpClose.click();
    await expect(zkpModal).toBeHidden();

    // 2. Hybrid Search Modal
    await page.evaluate(() => window.openSearchModal && window.openSearchModal());
    await page.waitForTimeout(200);

    const searchModal = page.locator('#searchModal');
    await expect(searchModal).toBeVisible();

    const searchInput = page.locator('#inputHybridSearch');
    const fontSize = await searchInput.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    // Must be >= 16px to prevent iOS Safari auto-zoom
    expect(fontSize).toBeGreaterThanOrEqual(16);

    const searchClose = page.locator('#searchModal .sheet-close-btn');
    const searchCloseBox = await searchClose.boundingBox();
    expect(searchCloseBox.width).toBeGreaterThanOrEqual(44);
    expect(searchCloseBox.height).toBeGreaterThanOrEqual(44);
    await searchClose.click();
    await expect(searchModal).toBeHidden();

    // 3. Clinician Override Modal
    await page.evaluate(() => window.openClinicianOverrideModal && window.openClinicianOverrideModal('Fever'));
    await page.waitForTimeout(200);

    const overrideModal = page.locator('#clinicianOverrideModal');
    await expect(overrideModal).toBeVisible();

    const overrideDialog = page.locator('#clinicianOverrideModal .override-modal-dialog');
    const overrideBox = await overrideDialog.boundingBox();
    expect(overrideBox).not.toBeNull();
    expect(overrideBox.y).toBeGreaterThanOrEqual(0);

    const overrideClose = page.locator('#clinicianOverrideModal .sheet-close-btn');
    const overrideCloseBox = await overrideClose.boundingBox();
    expect(overrideCloseBox.width).toBeGreaterThanOrEqual(44);
    expect(overrideCloseBox.height).toBeGreaterThanOrEqual(44);
    await overrideClose.click();
    await expect(overrideModal).toBeHidden();
  });

  test('Verification 6: Media Preview and Camera Modals polish and touch targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    const vp = page.viewportSize();

    // 1. Media Modal
    await page.evaluate(() => {
      const blob = new Blob(['sample-img'], { type: 'image/png' });
      const file = new File([blob], 'sample.png', { type: 'image/png' });
      if (typeof openMediaModal === 'function') openMediaModal(file);
    });
    await page.waitForTimeout(200);

    const mediaModal = page.locator('#mediaModal');
    await expect(mediaModal).toBeVisible();

    const mediaContent = page.locator('.media-modal-content');
    const mediaBox = await mediaContent.boundingBox();
    expect(mediaBox).not.toBeNull();
    // Modal content should fit within mobile screen height
    expect(mediaBox.height).toBeLessThanOrEqual(vp.height);

    const mediaClose = page.locator('#modalClose');
    const mediaCloseBox = await mediaClose.boundingBox();
    expect(mediaCloseBox.width).toBeGreaterThanOrEqual(44);
    expect(mediaCloseBox.height).toBeGreaterThanOrEqual(44);
    await mediaClose.click();
    await expect(mediaModal).toBeHidden();

    // 2. Camera Modal
    const cameraBtn = page.locator('#btnCamera');
    await cameraBtn.click();
    await page.waitForTimeout(200);

    const cameraModal = page.locator('#cameraModal');
    await expect(cameraModal).toBeVisible();

    const cameraClose = page.locator('#cameraClose');
    const camCloseBox = await cameraClose.boundingBox();
    expect(camCloseBox.width).toBeGreaterThanOrEqual(44);
    expect(camCloseBox.height).toBeGreaterThanOrEqual(44);

    const captureBtn = page.locator('#btnCapture');
    const capBox = await captureBtn.boundingBox();
    expect(capBox.height).toBeGreaterThanOrEqual(44);

    await cameraClose.click();
    await expect(cameraModal).toBeHidden();
  });

  test('Verification 7: Mobile Control Sheet contains quick-launch tools for ZKP, Hybrid Search, and PWA Install', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile test');
    await loadRamanApp(page);

    // Open control sheet
    const controlsBtn = page.locator('#btnMobileControls');
    await controlsBtn.click();
    await page.waitForTimeout(200);

    const controlSheet = page.locator('#mobileControlSheet');
    await expect(controlSheet).toBeVisible();

    // Verify presence of ZKP, Hybrid Search, and Install buttons
    const zkpSheetBtn = page.locator('#mobileControlSheet button:has-text("ZKP HEALTH PROVER")');
    await expect(zkpSheetBtn).toBeVisible();

    const searchSheetBtn = page.locator('#mobileControlSheet button:has-text("HYBRID SEARCH")');
    await expect(searchSheetBtn).toBeVisible();

    const installSheetBtn = page.locator('#sheetInstallBtn');
    await expect(installSheetBtn).toBeVisible();

    // Click ZKP button from sheet
    await zkpSheetBtn.click();
    await page.waitForTimeout(200);

    const zkpModal = page.locator('#zkpModal');
    await expect(zkpModal).toBeVisible();

    // Close ZKP modal
    await page.locator('#zkpModal .sheet-close-btn').click();
    await expect(zkpModal).toBeHidden();
  });

});
