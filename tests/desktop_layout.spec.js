const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Desktop Layout & Clinical Workflow', () => {

  test('should hide mobile bottom nav and show multi-column dashboard on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only test');

    await loadRamanApp(page);

    // Bottom navigation should be hidden on desktop
    const bottomNav = page.locator('#mobileBottomNav');
    await expect(bottomNav).toBeHidden();

    // Both major sections (sidebar and chat-area) should be visible simultaneously
    const profileSidebar = page.locator('.sidebar');
    const chatArea = page.locator('.chat-area');

    await expect(profileSidebar).toBeVisible();
    await expect(chatArea).toBeVisible();
  });

  test('should allow editing patient profile and vitals', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only test');

    await loadRamanApp(page);

    // Edit Patient Name
    const nameInput = page.locator('#patientName');
    await nameInput.fill('Dr. Alan Turing');
    await expect(nameInput).toHaveValue('Dr. Alan Turing');

    // Edit BP and Heart Rate
    const bpInput = page.locator('#patientBP');
    await bpInput.fill('120/80');
    await expect(bpInput).toHaveValue('120/80');

    const hrInput = page.locator('#patientHR');
    await hrInput.fill('72');
    await expect(hrInput).toHaveValue('72');
  });

  test('should toggle theme between dark and light modes', async ({ page }) => {
    await loadRamanApp(page);

    const themeToggleBtn = page.locator('#btnThemeToggle');
    await expect(themeToggleBtn).toBeVisible();

    // Initially dark
    const initialIsLight = await page.evaluate(() => document.body.classList.contains('light-theme'));
    expect(initialIsLight).toBe(false);

    // Toggle to Light
    await themeToggleBtn.click();
    const afterFirstToggle = await page.evaluate(() => document.body.classList.contains('light-theme'));
    expect(afterFirstToggle).toBe(true);

    // Toggle back to Dark
    await themeToggleBtn.click();
    const afterSecondToggle = await page.evaluate(() => document.body.classList.contains('light-theme'));
    expect(afterSecondToggle).toBe(false);
  });

  test('should render SVG Anatomical Scanner with hover and click hotspots', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only test');

    await loadRamanApp(page);

    const svgScanner = page.locator('.anatomical-map-svg');
    await expect(svgScanner).toBeVisible();

    // Hotspot for chest pain
    const chestHotspot = page.locator('.map-hotspot[data-symptom="chest pain"]');
    await expect(chestHotspot).toBeAttached();

    // Trigger hotspot click/inspection
    await chestHotspot.click({ force: true });
    const activeZone = page.locator('#activeScanZone');
    await expect(activeZone).toHaveText(/HEART|CHEST/i);
  });

});
