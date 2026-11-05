const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Tropical Diseases, Web Crypto Asymmetric Signatures & Multilingual Dictation', () => {

  test('should verify Web Crypto ECDSA P-256 signature generation and interactive in-browser verification in Health Card Modal', async ({ page }) => {
    await loadRamanApp(page);

    // 1. Verify window.RamanSignatureEngine is exposed
    const isEngineLoaded = await page.evaluate(() => {
      return typeof window.RamanSignatureEngine !== 'undefined' && typeof window.ramanSignatureEngine !== 'undefined';
    });
    expect(isEngineLoaded).toBe(true);

    // 2. Open SMART Digital Health Card modal
    await page.evaluate(() => {
      window.openDigitalHealthCardModal();
    });

    const modal = page.locator('#digitalHealthCardModal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 3. Check verify button is present
    const verifyBtn = page.locator('#btnVerifyCardSignature');
    await expect(verifyBtn).toBeVisible();
    await expect(verifyBtn).toHaveText(/VERIFY NOW/i);

    // 4. Click verify button to trigger interactive Web Crypto ECDSA verification
    await verifyBtn.click();

    // 5. Verify badge updates to verified status and displays cryptographic audit details
    await expect(verifyBtn).toHaveText(/✓ VERIFIED/i, { timeout: 5000 });
    const auditDetails = page.locator('#cardSigAuditDetails');
    await expect(auditDetails).toBeVisible();
    const auditText = await auditDetails.textContent();
    expect(auditText).toContain('Cryptographically Valid');
    expect(auditText).toContain('SHA-256 Digest');
  });

  test('should normalize colloquial speech transcripts using RamanSpeechEngine phonetic clinical correction', async ({ page }) => {
    await loadRamanApp(page);

    const normalizationResult = await page.evaluate(() => {
      if (!window.ramanSpeechEngine) return null;
      return {
        dengue: window.ramanSpeechEngine.normalizeClinicalSpeech('i have high dengu fewar and severe vomting'),
        chikungunya: window.ramanSpeechEngine.normalizeClinicalSpeech('severe joint aches chikangunya fever'),
        typhoid: window.ramanSpeechEngine.normalizeClinicalSpeech('step ladder taifoid fever with diarrhea'),
        malaria: window.ramanSpeechEngine.normalizeClinicalSpeech('cyclical chills maleria rigors')
      };
    });

    expect(normalizationResult).not.toBeNull();
    expect(normalizationResult.dengue).toContain('dengue');
    expect(normalizationResult.dengue).toContain('vomiting');
    expect(normalizationResult.chikungunya).toContain('chikungunya');
    expect(normalizationResult.typhoid).toContain('typhoid');
    expect(normalizationResult.malaria).toContain('malaria');
  });

  test('should triage Dengue Fever with ICD-11 1D20.0 and present clinical assessment', async ({ page }) => {
    await loadRamanApp(page);

    const userInput = page.locator('#userInput');
    await userInput.fill('I have high fever with severe retro-orbital eye pain and joint ache');
    await page.locator('#btnSend').click();

    // Wait for the AI assessment response
    const consultBubble = page.locator('.message.ai-message').filter({ hasText: /Dengue|1D20\.0|Retro-orbital/i }).last();
    await expect(consultBubble).toBeVisible({ timeout: 20000 });

    const textContent = await consultBubble.textContent();
    expect(textContent.toLowerCase()).toMatch(/dengue|1d20\.0|paracetamol/i);
  });

  test('should render tropical organ chips and populate consultation input on click', async ({ page }) => {
    await loadRamanApp(page);

    const dengueChip = page.locator('.organ-chip[data-symptom="dengue fever"]');
    await expect(dengueChip).toBeVisible();

    await dengueChip.click();

    const userInput = page.locator('#userInput');
    await expect(userInput).toHaveValue(/dengue fever/i);
  });

  test('should analyze tropical rapid test cassette in vision diagnostic modal and transfer findings to consultation', async ({ page }) => {
    await loadRamanApp(page);

    // 1. Open Camera / Vision Diagnostics modal
    await page.evaluate(() => {
      const modal = document.getElementById('cameraModal');
      if (modal) modal.style.display = 'block';
    });

    const modal = page.locator('#cameraModal');
    await expect(modal).toBeVisible();

    // 2. Select Tropical Dengue mode
    const modeSelect = page.locator('#visionDiagnosticMode');
    await modeSelect.selectOption('TROPICAL_DENGUE');

    // 3. Draw a synthetic Dengue NS1 positive cassette onto captureCanvas
    await page.evaluate(() => {
      const canvas = document.getElementById('captureCanvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      // Background white
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 100, 100);
      // Control line (y=20)
      ctx.fillStyle = '#4a0404';
      ctx.fillRect(25, 18, 50, 4);
      // NS1 line (y=80)
      ctx.fillRect(25, 78, 50, 4);

      // Execute analysis using canvas directly
      const result = window.RamanVisionDiagnostics.analyzeTropicalMultiplexStrip(canvas, 'DENGUE_DUO');
      window._activeVisionResult = result;
      const resultCard = document.getElementById("visionResultCard");
      const resultTitle = document.getElementById("visionResultTitle");
      const resultBody = document.getElementById("visionResultBody");
      if (resultCard && result) {
        resultCard.style.display = "block";
        if (resultTitle) resultTitle.textContent = `VISION ANALYSIS [${result.modality}]: ${result.classification}`;
        if (resultBody) resultBody.innerHTML = `<strong>Triage:</strong> ${result.recommendation}`;
      }
    });

    // 4. Verify result card is populated with Dengue findings
    const resultCard = page.locator('#visionResultCard');
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toContainText('DENGUE_ACUTE_NS1_POSITIVE');

    // 5. Click transfer to consultation button
    const transferBtn = page.locator('#btnTransferVisionToConsult');
    await expect(transferBtn).toBeVisible();
    await transferBtn.click();

    // 6. Verify modal closed and consultation message dispatched
    await expect(modal).not.toBeVisible();
    const userMsg = page.locator('.message.user-message').filter({ hasText: /DENGUE_ACUTE_NS1_POSITIVE/i }).last();
    await expect(userMsg).toBeVisible({ timeout: 10000 });
  });

});
