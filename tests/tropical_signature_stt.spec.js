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

});
