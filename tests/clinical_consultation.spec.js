const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Clinical Consultation & Offline SLM Diagnostic Engine', () => {

  test('should generate offline clinical consultation with medication triage for fever', async ({ page }) => {
    await loadRamanApp(page);

    const userInput = page.locator('#userInput');
    const sendBtn = page.locator('#btnSend');

    await userInput.fill('I have high fever with headache and body chills');
    await sendBtn.click();

    // Verify user bubble appeared
    const userBubble = page.locator('.message.user-message').last();
    await expect(userBubble).toBeVisible();
    await expect(userBubble).toContainText('high fever');

    // Wait for local SLM consultation response containing fever diagnosis
    const consultBubble = page.locator('.message.ai-message').filter({ hasText: /fever|diagnosis|triage/i }).last();
    await expect(consultBubble).toBeVisible({ timeout: 20000 });

    // Verify prescription or triage actions exist
    const rxActions = page.locator('.rx-actions, .prescription-container, .med-item, .med-section');
    const hasRx = (await rxActions.count()) > 0;
    expect(hasRx).toBe(true);
  });

  test('should flag allergy conflict and recommend safe alternative', async ({ page, isMobile }) => {
    await loadRamanApp(page);

    if (isMobile) {
      // On mobile, switch to profile tab to enter allergies, then back to consult
      await page.click('#navBtnProfile');
      await page.locator('#patientAllergies').fill('Penicillin');
      await page.locator('#patientAllergies').dispatchEvent('change');
      await page.click('#navBtnConsult');
    } else {
      // Set patient allergy to Penicillin directly in visible sidebar
      const allergiesInput = page.locator('#patientAllergies');
      await allergiesInput.fill('Penicillin');
      await allergiesInput.dispatchEvent('change');
    }

    // Submit a query for acute bacterial tonsillitis
    const userInput = page.locator('#userInput');
    await userInput.fill('Acute bacterial tonsillitis with swollen red tonsils and white exudate patches');
    await page.locator('#btnSend').click();

    // Wait for consultation response containing safety substitution or allergy warning
    const allergyBubble = page.locator('.message.ai-message').filter({ hasText: /Azithromycin|ALLERGY|Contraindicated|substitute/i }).last();
    await expect(allergyBubble).toBeVisible({ timeout: 20000 });
  });

});
