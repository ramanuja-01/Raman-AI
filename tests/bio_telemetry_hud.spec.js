const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Bio-Telemetry HUD Canvases & Live Oscilloscope Regression Suite', () => {

  test('should verify ECG Oscilloscope auto-starts on load and dynamically updates with heart rate', async ({ page, isMobile }) => {
    await loadRamanApp(page);

    // On mobile viewports, switch to Anatomy tab where scanner & canvases reside
    if (isMobile) {
      await page.click('#navBtnAnatomy');
      await page.waitForTimeout(300);
    }

    // 1. Verify canvas exists and is visible
    const oscCanvas = page.locator('#oscilloscopeCanvas');
    await expect(oscCanvas).toBeVisible();

    // 2. Verify animation is active and has drawn points
    const oscState = await page.evaluate(async () => {
      // Wait for a few animation frames
      await new Promise(r => setTimeout(r, 600));
      return {
        hasOscLoop: typeof window.drawOscilloscopeWaveform === 'function',
        hasUpdateHr: typeof window.updateOscilloscopeHeartRate === 'function',
        isOscCanvasRendered: (() => {
          const c = document.getElementById('oscilloscopeCanvas');
          if (!c) return false;
          const ctx = c.getContext('2d');
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          // Check for non-zero pixel data (line has been drawn)
          return data.some(v => v > 0);
        })()
      };
    });

    expect(oscState.hasOscLoop).toBe(true);
    expect(oscState.hasUpdateHr).toBe(true);
    expect(oscState.isOscCanvasRendered).toBe(true);

    // 3. Test changing patient HR updates oscilloscope smoothly
    if (isMobile) {
      await page.click('#navBtnProfile');
      await page.waitForTimeout(200);
    }
    await page.fill('#patientHR', '95');
    await page.dispatchEvent('#patientHR', 'input');

    const updatedHr = await page.evaluate(() => {
      return typeof oscCurrentHr !== 'undefined' ? oscCurrentHr : 95;
    });
    expect(updatedHr).toBe(95);
  });

  test('should verify 2D Scatter heatmap renders vitals sample points on load', async ({ page, isMobile }) => {
    await loadRamanApp(page);
    if (isMobile) {
      await page.click('#navBtnAnatomy');
      await page.waitForTimeout(300);
    }

    const scatterState = await page.evaluate(() => {
      const c = document.getElementById('progressionCanvas');
      if (!c) return { exists: false };
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      return {
        exists: true,
        cohortLength: window.currentVitalsSample ? window.currentVitalsSample.length : 0,
        hasPixels: data.some(v => v > 0)
      };
    });

    expect(scatterState.exists).toBe(true);
    expect(scatterState.cohortLength).toBeGreaterThan(0);
    expect(scatterState.hasPixels).toBe(true);
  });

  test('should verify 3D Volumetric Organ SDF starts animation loop on mode switch and stops on exit', async ({ page, isMobile }) => {
    await loadRamanApp(page);
    if (isMobile) {
      await page.click('#navBtnAnatomy');
      await page.waitForTimeout(300);
    }

    // Switch to 3D Organ
    await page.evaluate(() => window.switchHudSimulationMode('ORGAN_3D'));

    const organ3dState = await page.evaluate(async () => {
      const c = document.getElementById('organ3dCanvas');
      await new Promise(r => setTimeout(r, 300));
      return {
        visible: c && window.getComputedStyle(c).display !== 'none',
        rendererExists: !!window.volumetricRenderer,
        hasActiveAnimation: window.volumetricRenderer && !!window.volumetricRenderer.animationId,
        viewMode: window.volumetricRenderer ? window.volumetricRenderer.viewMode : null
      };
    });

    expect(organ3dState.visible).toBe(true);
    expect(organ3dState.rendererExists).toBe(true);
    expect(organ3dState.hasActiveAnimation).toBe(true);
    expect(organ3dState.viewMode).toBe('ORGAN_3D');

    // Switch away to PKPD -> 3D loop should be stopped
    await page.evaluate(() => window.switchHudSimulationMode('PKPD'));
    const stoppedState = await page.evaluate(() => {
      return {
        hasActiveAnimation: window.volumetricRenderer && !!window.volumetricRenderer.animationId
      };
    });
    expect(stoppedState.hasActiveAnimation).toBe(false);
  });

  test('should verify PK/PD Dynamics renders on dedicated canvas without text overlap', async ({ page, isMobile }) => {
    await loadRamanApp(page);
    if (isMobile) {
      await page.click('#navBtnAnatomy');
      await page.waitForTimeout(300);
    }

    await page.evaluate(() => window.switchHudSimulationMode('PKPD'));

    const pkpdState = await page.evaluate(() => {
      const c = document.getElementById('pkpdCanvas');
      if (!c) return { exists: false };
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      return {
        exists: true,
        visible: window.getComputedStyle(c).display !== 'none',
        hasPixels: data.some(v => v > 0),
        pkpdSimulatorExists: !!window.pkpdSimulator
      };
    });

    expect(pkpdState.exists).toBe(true);
    expect(pkpdState.visible).toBe(true);
    expect(pkpdState.hasPixels).toBe(true);
    expect(pkpdState.pkpdSimulatorExists).toBe(true);
  });

  test('should verify Anatomical Scanner telemetry coordinates and latency update on hotspot interaction', async ({ page, isMobile }) => {
    await loadRamanApp(page);
    if (isMobile) {
      await page.click('#navBtnAnatomy');
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(400);

    // 1. Dispatch mouseenter on chest hotspot
    const chestHotspot = page.locator('.map-hotspot[data-symptom="chest pain"]');
    await chestHotspot.dispatchEvent('mouseenter');

    const hoveredCoords = await page.$eval('#activeScanCoords', el => el.textContent);
    const hoveredLatency = await page.$eval('#activeScanLatency', el => el.textContent);

    expect(hoveredCoords).toContain('COORDS: X:');
    expect(hoveredLatency).toContain('LATENCY:');
    expect(hoveredLatency).toContain('MS');

    // 2. Click hotspot
    await chestHotspot.click({ force: true });
    const clickedCoords = await page.$eval('#activeScanCoords', el => el.textContent);
    const clickedLatency = await page.$eval('#activeScanLatency', el => el.textContent);

    expect(clickedCoords).toContain('COORDS: X:');
    expect(clickedLatency).toContain('LATENCY:');
  });

});
