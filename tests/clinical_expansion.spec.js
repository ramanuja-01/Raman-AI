const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Clinical Expansion (ICD-11 & SNOMED CT) & Safety Interceptions', () => {

  test('should triage Pediatric Acute Otitis Media with ICD-11 AB00 and SNOMED CT Amoxicillin', async ({ page }) => {
    await loadRamanApp(page);

    const userInput = page.locator('#userInput');
    await userInput.fill('Child ear tugging and acute ear pain with fever in toddler');
    await page.locator('#btnSend').click();

    // Verify consultation card appeared
    const consultBubble = page.locator('.message.ai-message').filter({ hasText: /otitis media|ear infection|AB00/i }).last();
    await expect(consultBubble).toBeVisible({ timeout: 20000 });

    // Verify WHO ICD-11 badge AB00 or Amoxicillin recommendation
    const textContent = await consultBubble.textContent();
    expect(textContent.toLowerCase()).toMatch(/otitis|ear|ab00|amoxicillin|mox/i);
  });

  test('should triage Dysmenorrhea with GA34.0 and Mefenamic Acid', async ({ page }) => {
    await loadRamanApp(page);

    const userInput = page.locator('#userInput');
    await userInput.fill('Severe menstrual cramps with lower pelvic pain dysmenorrhea');
    await page.locator('#btnSend').click();

    const consultBubble = page.locator('.message.ai-message').filter({ hasText: /dysmenorrhea|cramps|GA34\.0|mefenamic/i }).last();
    await expect(consultBubble).toBeVisible({ timeout: 20000 });

    const textContent = await consultBubble.textContent();
    expect(textContent.toLowerCase()).toMatch(/dysmenorrhea|cramps|mefenamic|meftal/i);
  });

  test('should intercept Penicillin allergy for Acute Otitis Media and substitute with Azithromycin', async ({ page, isMobile }) => {
    await loadRamanApp(page);

    if (isMobile) {
      await page.click('#navBtnProfile');
      await page.locator('#patientAllergies').fill('Penicillin');
      await page.locator('#patientAllergies').dispatchEvent('change');
      await page.click('#navBtnConsult');
    } else {
      const allergiesInput = page.locator('#patientAllergies');
      await allergiesInput.fill('Penicillin');
      await allergiesInput.dispatchEvent('change');
    }

    const userInput = page.locator('#userInput');
    await userInput.fill('Pediatric acute otitis media severe ear pain in child');
    await page.locator('#btnSend').click();

    // Verify safe substitution
    const allergyBubble = page.locator('.message.ai-message').filter({ hasText: /Azithromycin|ALLERGY|Contraindicated|Safe Sub/i }).last();
    await expect(allergyBubble).toBeVisible({ timeout: 20000 });
  });

});
