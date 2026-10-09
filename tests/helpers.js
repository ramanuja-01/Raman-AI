/**
 * Helper to navigate to RAMAN AI, complete patient profile for clinical safety,
 * and bypass the initial 4.8s splash screen animation.
 */
async function loadRamanApp(page, fillProfile = true) {
  await page.goto('/');

  // Pre-seed and populate complete patient profile for clinical safety
  await page.evaluate((shouldFill) => {
    if (shouldFill) {
      const defaultProfile = {
        name: 'Raman',
        age: '34',
        gender: 'male',
        blood: 'B+',
        allergies: 'None',
        bp: '120/80',
        heartRate: '72',
        temp: '98.6',
        SpO2: '98'
      };
      try {
        localStorage.setItem('ramanai_profile', JSON.stringify(defaultProfile));
      } catch (e) {}

      const name = document.getElementById('patientName');
      const age = document.getElementById('patientAge');
      const gender = document.getElementById('patientGender');
      const blood = document.getElementById('patientBlood');
      const allergies = document.getElementById('patientAllergies');
      if (name) name.value = 'Raman';
      if (age) age.value = '34';
      if (gender) gender.value = 'male';
      if (blood) blood.value = 'B+';
      if (allergies) allergies.value = 'None';
    }

    if (typeof window.transitionToApp === 'function') {
      window.transitionToApp();
    }
    if (typeof window.initAnatomicalScanner === 'function') {
      window.initAnatomicalScanner();
    }
  }, fillProfile);

  // Wait for the app container to display
  await page.waitForFunction(() => {
    const app = document.getElementById('appContainer');
    return app && window.getComputedStyle(app).display === 'flex';
  }, { timeout: 10000 });

  // Ensure anatomical scanner is initialized and event listeners attached
  await page.evaluate(() => {
    if (typeof window.initAnatomicalScanner === 'function') {
      window.initAnatomicalScanner();
    }
  });
}

module.exports = { loadRamanApp };
