const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Milestone 4: Federated Active Learning (DP) & Quantized SLM SOAP Engine', () => {

  test('should verify Federated Learning and Quantized SLM are loaded globally', async ({ page }) => {
    await loadRamanApp(page);

    const status = await page.evaluate(() => {
      return {
        hasFedLearning: !!window.RamanFederatedLearning,
        hasFedLearnerInstance: !!window.ramanFederatedLearner,
        hasQuantizedSlm: !!window.RamanQuantizedSlm,
        hasQuantizedSlmInstance: !!window.ramanQuantizedSlm
      };
    });

    expect(status.hasFedLearning).toBe(true);
    expect(status.hasFedLearnerInstance).toBe(true);
    expect(status.hasQuantizedSlm).toBe(true);
    expect(status.hasQuantizedSlmInstance).toBe(true);
  });

  test('should generate differential privacy protected gradient package in browser', async ({ page }) => {
    await loadRamanApp(page);

    const dpResult = await page.evaluate(() => {
      const learner = window.ramanFederatedLearner;
      const mockDeltas = { "headache": "migraine", "fever": "viral" };
      const pkg = learner.exportPrivacyPreservingGradientPackage(mockDeltas);
      return {
        protocol: pkg.protocol,
        sampleCount: pkg.sampleCount,
        epsilon: pkg.privacyMetrics.epsilon,
        hasGradients: Array.isArray(pkg.gradientVector) && pkg.gradientVector.length === 64
      };
    });

    expect(dpResult.protocol).toBe('RAMAN-FEDERATED-LEARNING-v1');
    expect(dpResult.sampleCount).toBe(2);
    expect(dpResult.epsilon).toBe(1.5);
    expect(dpResult.hasGradients).toBe(true);
  });

  test('should execute offline Quantized SLM SOAP narrative generator in browser', async ({ page }) => {
    await loadRamanApp(page);

    const narrativeResult = await page.evaluate(() => {
      const qSlm = window.ramanQuantizedSlm;
      const context = {
        profile: { name: 'Raman', age: '34', gender: 'male' },
        condition: 'Hypertension Stage 1',
        icd11: 'BA00',
        vitals: { heartRate: '78', bp: '138/88', SpO2: '99', temp: '98.6' },
        medications: [{ name: 'Amlodipine 5mg', dose: '1 tab daily' }],
        precautions: ['Monitor BP twice daily', 'Low-sodium DASH diet']
      };
      return qSlm.generateClinicalNarrative(context);
    });

    expect(narrativeResult.runtime).toContain('RAMAN-SLM');
    expect(narrativeResult.soap.subjective).toContain('Raman');
    expect(narrativeResult.soap.objective).toContain('138/88');
    expect(narrativeResult.soap.assessment).toContain('BA00');
    expect(narrativeResult.soap.plan).toContain('Amlodipine');
    expect(narrativeResult.formattedNote).toContain('[SUBJECTIVE]');
    expect(narrativeResult.formattedNote).toContain('[PLAN]');
  });

});
