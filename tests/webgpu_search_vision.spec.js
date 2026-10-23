const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Milestone 3: WebGPU Volumetric SDF, PK/PD Dynamics, Hybrid Search & Vision Diagnostics', () => {

  test('should verify all Phase 3 global modules and UI components are loaded', async ({ page }) => {
    await loadRamanApp(page);

    const moduleStatus = await page.evaluate(() => {
      return {
        hasVolumetricRenderer: !!window.RamanVolumetricRenderer,
        hasPkpdSimulator: !!window.RamanPkPdSimulator,
        hasHybridSearch: !!window.RamanHybridSearchEngine,
        hasVisionDiagnostics: !!window.RamanVisionDiagnostics,
        hasSwitchHudMode: typeof window.switchHudSimulationMode === 'function',
        hasOpenSearchModal: typeof window.openSearchModal === 'function',
        hasExecuteSearch: typeof window.executeHybridSearch === 'function',
        hasExecuteVision: typeof window.executeVisionDiagnostics === 'function'
      };
    });

    expect(moduleStatus.hasVolumetricRenderer).toBe(true);
    expect(moduleStatus.hasPkpdSimulator).toBe(true);
    expect(moduleStatus.hasHybridSearch).toBe(true);
    expect(moduleStatus.hasVisionDiagnostics).toBe(true);
    expect(moduleStatus.hasSwitchHudMode).toBe(true);
    expect(moduleStatus.hasOpenSearchModal).toBe(true);
    expect(moduleStatus.hasExecuteSearch).toBe(true);
    expect(moduleStatus.hasExecuteVision).toBe(true);

    // Verify DOM controls exist
    const btnOrgan3d = await page.$('#btnModeOrgan3D');
    const btnPkpd = await page.$('#btnModePkpd');
    const btnHeatmap = await page.$('#btnModeHeatmap');
    const btnSearch = await page.$('#btnOpenSearchModal');

    expect(btnOrgan3d).not.toBeNull();
    expect(btnPkpd).not.toBeNull();
    expect(btnHeatmap).not.toBeNull();
    expect(btnSearch).not.toBeNull();
  });

  test('should toggle HUD simulation modes between 2D Scatter, 3D Organ SDF, and PK/PD Dynamics', async ({ page }) => {
    await loadRamanApp(page);

    // 1. Switch to 3D Organ Volume
    await page.evaluate(() => window.switchHudSimulationMode('ORGAN_3D'));
    const organTitle = await page.$eval('#hudCanvasModeTitle', el => el.textContent);
    expect(organTitle).toContain('3D Volumetric Organ SDF');

    // 2. Switch to PK/PD Dynamics
    await page.evaluate(() => window.switchHudSimulationMode('PKPD'));
    const pkpdTitle = await page.$eval('#hudCanvasModeTitle', el => el.textContent);
    expect(pkpdTitle).toContain('Pharmacokinetic (PK/PD) Dynamics');

    // 3. Switch back to 2D Scatter
    await page.evaluate(() => window.switchHudSimulationMode('HEATMAP'));
    const heatmapTitle = await page.$eval('#hudCanvasModeTitle', el => el.textContent);
    expect(heatmapTitle).toContain('Vital Density Progression');
  });

  test('should execute offline BM25 + dense vector hybrid search with RRF scoring', async ({ page }) => {
    await loadRamanApp(page);

    // 1. Open search modal
    await page.evaluate(() => window.openSearchModal());
    const modalDisplay = await page.$eval('#searchModal', el => window.getComputedStyle(el).display);
    expect(modalDisplay).not.toBe('none');

    // 2. Perform search for Paracetamol
    await page.fill('#inputHybridSearch', 'Paracetamol 650mg');
    await page.click('#btnExecuteSearch');

    // 3. Verify results populated
    await page.waitForFunction(() => {
      const list = document.getElementById('searchResultList');
      return list && list.textContent.includes('Paracetamol');
    }, { timeout: 5000 });

    const searchCardText = await page.$eval('#searchResultList', el => el.textContent);
    expect(searchCardText).toContain('Paracetamol');
    expect(searchCardText).toContain('RRF:');
    expect(searchCardText).toContain('BM25:');
  });

  test('should execute offline computer vision diagnostic routines in browser', async ({ page }) => {
    await loadRamanApp(page);

    const visionResults = await page.evaluate(() => {
      const Vision = window.RamanVisionDiagnostics;
      if (!Vision) return { error: 'No Vision class' };

      // Synthetic image helper
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');

      // 1. Paint red eye frame
      ctx.fillStyle = '#e64646';
      ctx.fillRect(0, 0, 40, 40);
      const ocularResult = Vision.analyzeOcularRedness(canvas);

      // 2. Paint lateral-flow test strip (2 dark lines)
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, 40, 40);
      ctx.fillStyle = '#401525';
      ctx.fillRect(10, 10, 20, 3); // Control band
      ctx.fillRect(10, 25, 20, 3); // Test band
      const stripResult = Vision.analyzeLateralFlowStrip(canvas);

      return {
        ocularModality: ocularResult.modality,
        ocularClassification: ocularResult.classification,
        stripModality: stripResult.modality,
        stripResult: stripResult.result
      };
    });

    expect(visionResults.ocularModality).toBe('OCULAR_REDNESS');
    expect(visionResults.ocularClassification).toBe('MARKED_CONJUNCTIVITIS_OR_UVEITIS');
    expect(visionResults.stripModality).toBe('LATERAL_FLOW_STRIP');
    expect(visionResults.stripResult).toBe('POSITIVE');
  });

});
