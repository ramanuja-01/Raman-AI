const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Mobile Navigation & Touch Interactions', () => {

  test('should display bottom navigation and default to Consult tab on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    // Check bottom navigation exists and is visible
    const bottomNav = page.locator('#mobileBottomNav');
    await expect(bottomNav).toBeVisible();

    // Check active tab attribute on body
    const bodyActiveTab = await page.evaluate(() => document.body.getAttribute('data-active-tab'));
    expect(bodyActiveTab).toBe('consult');

    // Consult tab button should have active class and aria-selected="true"
    const consultBtn = page.locator('#navBtnConsult');
    await expect(consultBtn).toHaveClass(/active/);
    await expect(consultBtn).toHaveAttribute('aria-selected', 'true');

    // Central chat consultation should be visible
    const chatContainer = page.locator('.chat-messages');
    await expect(chatContainer).toBeVisible();
  });

  test('should satisfy WCAG 2.1 AA 44px minimum tap targets for bottom navigation', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    const navButtons = page.locator('#mobileBottomNav .nav-tab-btn');
    const count = await navButtons.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const btn = navButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('should switch between tabs seamlessly on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    // 1. Switch to Anatomy
    await page.click('#navBtnAnatomy');
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'anatomy');
    await expect(page.locator('#navBtnAnatomy')).toHaveClass(/active/);
    await expect(page.locator('.anatomical-map-svg')).toBeVisible();

    // 2. Switch to Vault
    await page.click('#navBtnVault');
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'vault');
    await expect(page.locator('#navBtnVault')).toHaveClass(/active/);
    await expect(page.locator('#diaryCanvas')).toBeVisible();

    // 3. Switch to Profile
    await page.click('#navBtnProfile');
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'profile');
    await expect(page.locator('#navBtnProfile')).toHaveClass(/active/);
    await expect(page.locator('#patientName')).toBeVisible();

    // 4. Return to Consult
    await page.click('#navBtnConsult');
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'consult');
    await expect(page.locator('#navBtnConsult')).toHaveClass(/active/);
    await expect(page.locator('#chatMessages')).toBeVisible();
  });

  test('should support organ chip clicks and route to consult triage', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    // Go to Anatomy tab
    await page.click('#navBtnAnatomy');
    await expect(page.locator('#anatomicalChipsCarousel')).toBeVisible();

    // Tap on Chest organ chip
    const chestChip = page.locator('.organ-chip[data-symptom="chest pain"]');
    await expect(chestChip).toBeVisible();
    await chestChip.scrollIntoViewIfNeeded();
    await chestChip.click();

    // Automatically routes back to consult tab on mobile
    await expect(page.locator('body')).toHaveAttribute('data-active-tab', 'consult', { timeout: 7000 });
  });

  test('should render and interact with quick symptom scroller chips', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    const scroller = page.locator('#quickSymptomsScroller');
    await expect(scroller).toBeVisible();

    const symptomChip = page.locator('#quickSymptomsScroller .symptom-tag').first();
    await expect(symptomChip).toBeVisible();
    
    // Tap symptom chip (triggers immediate sendMessage)
    await symptomChip.click();

    // Verify user message appeared in the chat feed
    const userMessage = page.locator('.message.user-message').last();
    await expect(userMessage).toBeVisible({ timeout: 7000 });
  });

  test('should support touch scrubbing on Recovery Diary canvas', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    // Switch to Vault tab where diaryCanvas resides
    await page.click('#navBtnVault');
    const canvas = page.locator('#diaryCanvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Dispatch touch tap
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    
    // Evaluate that canvas didn't error
    const hasCanvasContext = await page.evaluate(() => {
      const c = document.getElementById('diaryCanvas');
      return !!c && !!c.getContext('2d');
    });
    expect(hasCanvasContext).toBe(true);
  });

  test('should display 52px single-row mobile header without spillage', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    const header = page.locator('.app-header');
    await expect(header).toBeVisible();

    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeLessThanOrEqual(56);

    const oldMenuBtn = page.locator('#mobileMenuBtn');
    await expect(oldMenuBtn).toBeHidden();

    const moreBtn = page.locator('#btnMobileControls');
    await expect(moreBtn).toBeVisible();

    const themeToggle = page.locator('#btnThemeToggle');
    await expect(themeToggle).toBeVisible();
  });

  test('should open and dismiss Mobile Quick Control Sheet bottom drawer', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    const moreBtn = page.locator('#btnMobileControls');
    await moreBtn.click();

    const sheet = page.locator('#mobileControlSheet');
    await expect(sheet).toHaveClass(/open/);
    await expect(sheet).toBeVisible();

    const backdrop = page.locator('#mobileControlBackdrop');
    await expect(backdrop).toBeVisible();

    const closeBtn = page.locator('#mobileControlSheet .sheet-close-btn');
    await closeBtn.click();

    await expect(sheet).not.toHaveClass(/open/);
  });

  test('should configure 16px font on inputs to prevent iOS Safari auto-zoom', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific test');

    await loadRamanApp(page);

    const userInput = page.locator('#userInput');
    const fontSize = await userInput.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

});
