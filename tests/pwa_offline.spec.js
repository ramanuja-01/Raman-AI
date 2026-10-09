const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('PWA & Offline Service Worker Capabilities', () => {

  test('should link a valid Web App Manifest with correct metadata', async ({ page, request }) => {
    await loadRamanApp(page);

    // Check manifest link tag in head
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', 'manifest.json');

    // Fetch manifest via HTTP request
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);

    const manifestData = await response.json();
    expect(manifestData.name).toContain('RAMAN AI');
    expect(manifestData.display).toBe('standalone');
    expect(manifestData.theme_color).toBe('#00e5ff');
    expect(manifestData.background_color).toBe('#050d1a');
    expect(Array.isArray(manifestData.icons)).toBe(true);
    expect(manifestData.icons.length).toBeGreaterThan(0);
  });

  test('should provide an active Service Worker script', async ({ request }) => {
    const response = await request.get('/sw.js');
    expect(response.status()).toBe(200);

    const swContent = await response.text();
    expect(swContent).toContain('CACHE_NAME');
    expect(swContent).toContain('addEventListener');
    expect(swContent).toContain('fetch');
  });

  test('should have mobile viewport-fit and apple meta tags configured', async ({ page }) => {
    await loadRamanApp(page);

    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute('content', /viewport-fit=cover/);

    const appleMeta = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleMeta).toHaveAttribute('content', 'yes');
  });

});
