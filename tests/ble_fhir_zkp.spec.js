const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Milestone 2: Web Bluetooth BLE, HL7 FHIR R4 & Client-Side ZKP', () => {

  test('should verify Milestone 2 global APIs and UI elements are loaded in page', async ({ page }) => {
    await loadRamanApp(page);

    const apiStatus = await page.evaluate(() => {
      return {
        hasBleManager: !!window.RamanBleManager,
        hasRamanBleInstance: !!window.ramanBle,
        hasXiaomiSteps: typeof window.parseXiaomiSteps === 'function',
        hasXiaomiBattery: typeof window.parseXiaomiBattery === 'function',
        hasXiaomiSpO2: typeof window.parseXiaomiSpO2 === 'function',
        hasXiaomiBrand: typeof window.isXiaomiBrand === 'function',
        hasHrvCalculator: typeof window.calculateHrvMetrics === 'function',
        hasFhirGenerator: typeof window.generateFhirR4Bundle === 'function',
        hasFhirDownloader: typeof window.downloadFhirR4Json === 'function',
        hasZkpProver: !!window.RamanZkpProver,
        hasOpenZkpModal: typeof window.openZkpModal === 'function',
        hasExecuteZkpGeneration: typeof window.executeZkpGeneration === 'function'
      };
    });

    expect(apiStatus.hasBleManager).toBe(true);
    expect(apiStatus.hasRamanBleInstance).toBe(true);
    expect(apiStatus.hasXiaomiSteps).toBe(true);
    expect(apiStatus.hasXiaomiBattery).toBe(true);
    expect(apiStatus.hasXiaomiSpO2).toBe(true);
    expect(apiStatus.hasXiaomiBrand).toBe(true);
    expect(apiStatus.hasHrvCalculator).toBe(true);
    expect(apiStatus.hasFhirGenerator).toBe(true);
    expect(apiStatus.hasFhirDownloader).toBe(true);
    expect(apiStatus.hasZkpProver).toBe(true);
    expect(apiStatus.hasOpenZkpModal).toBe(true);
    expect(apiStatus.hasExecuteZkpGeneration).toBe(true);

    // Verify DOM triggers exist
    const btnBle = await page.$('#btnBleConnect');
    const wearableInfo = await page.$('#bleWearableInfo');
    const bleHelpTip = await page.$('#bleHelpTip');
    const btnFhir = await page.$('#btnExportFhir');
    const btnZkp = await page.$('#btnOpenZkp');

    expect(btnBle).not.toBeNull();
    expect(wearableInfo).not.toBeNull();
    expect(bleHelpTip).not.toBeNull();
    expect(btnFhir).not.toBeNull();
    expect(btnZkp).not.toBeNull();
  });

  test('should test BLE telemetry data parsing and DOM sync', async ({ page }) => {
    await loadRamanApp(page);

    const telemetryTestResult = await page.evaluate(() => {
      const ble = window.ramanBle;
      if (!ble) return { error: 'No ble instance' };

      // 1. Synthetic 8-bit Heart Rate DataView: Flags = 0x00, HR = 78
      const hrBuffer = new Uint8Array([0x00, 78]).buffer;
      const hrView = new DataView(hrBuffer);
      ble.handleHeartRateMeasurement(hrView);

      // 2. Synthetic SpO2 DataView: Flags = 0x00, SpO2 SFLOAT 99% (0x0063), Pulse 72 (0x0048)
      const plxBuffer = new Uint8Array([0x00, 0x63, 0x00, 0x48, 0x00]).buffer;
      const plxView = new DataView(plxBuffer);
      ble.handlePulseOximeterMeasurement(plxView);

      const hrInput = document.getElementById('patientHR');
      const spo2Input = document.getElementById('patientSpO2');

      return {
        state: ble.state,
        hrInputValue: hrInput ? hrInput.value : null,
        spo2InputValue: spo2Input ? spo2Input.value : null
      };
    });

    // HR reflects the pulse rate from the combined pulse oximeter telemetry (72 bpm)
    expect(telemetryTestResult.hrInputValue).toBe('72');
    expect(telemetryTestResult.spo2InputValue).toBe('99');
  });

  test('should test Xiaomi wearable BLE telemetry parsing, optical continuous PPG activation, and badge sync', async ({ page }) => {
    await loadRamanApp(page);

    const xiaomiResult = await page.evaluate(() => {
      const ble = window.ramanBle;
      if (!ble) return { error: 'No ble instance' };

      // Set Xiaomi Device Identity
      ble.isXiaomiDevice = true;
      ble.deviceModel = "Mi Smart Band 8";
      ble.setState("STREAMING");

      // 1. Synthetic 32-bit LE Steps DataView (10,420 steps, 7,500m, 320 kcal)
      const stepsBuffer = new ArrayBuffer(12);
      const stepsView = new DataView(stepsBuffer);
      stepsView.setUint32(0, 10420, true);
      stepsView.setUint32(4, 7500, true);
      stepsView.setUint32(8, 320, true);
      ble.handleXiaomiSteps(stepsView);

      // 2. Synthetic Xiaomi Battery DataView (Byte 1 = 85%, Byte 2 = 1 [Charging])
      const batBuf = new Uint8Array([0x00, 85, 0x01]);
      ble.handleXiaomiBattery(new DataView(batBuf.buffer));

      // 3. Synthetic Xiaomi SpO2 DataView (Byte 1 = 97%)
      const spo2Buf = new Uint8Array([0x00, 97]);
      ble.handleXiaomiSpO2(new DataView(spo2Buf.buffer));

      // 4. Synthetic Continuous PPG Heart Rate with RR-Intervals (Flags = 0x10 [RR-Present], HR = 76, RR = 800, 820)
      const hrWithRrBuf = new Uint8Array([0x10, 76, 0x20, 0x03, 0x34, 0x03]);
      ble.handleHeartRateMeasurement(new DataView(hrWithRrBuf.buffer));

      const infoEl = document.getElementById('bleWearableInfo');
      const labelEl = document.getElementById('bleStatusLabel');
      const spo2Input = document.getElementById('patientSpO2');

      const infoTextBefore = infoEl ? infoEl.textContent : '';
      const infoDisplayBefore = infoEl ? window.getComputedStyle(infoEl).display : '';
      const labelText = labelEl ? labelEl.textContent : '';

      // Test Disconnect Cleanup
      ble.disconnect();
      const infoDisplayAfter = infoEl ? window.getComputedStyle(infoEl).display : '';

      return {
        brandValidation: {
          miBand: window.isXiaomiBrand("Mi Smart Band 8"),
          amazfit: window.isXiaomiBrand("Amazfit GTS 4"),
          redmi: window.isXiaomiBrand("Redmi Watch 3"),
          thirdParty: window.isXiaomiBrand("Polar H10")
        },
        infoText: infoTextBefore,
        infoDisplayBefore,
        labelText,
        spo2InputValue: spo2Input ? spo2Input.value : null,
        infoDisplayAfter,
        stateAfter: ble.state,
        isXiaomiAfter: ble.isXiaomiDevice
      };
    });

    // Verify brand filters
    expect(xiaomiResult.brandValidation.miBand).toBe(true);
    expect(xiaomiResult.brandValidation.amazfit).toBe(true);
    expect(xiaomiResult.brandValidation.redmi).toBe(true);
    expect(xiaomiResult.brandValidation.thirdParty).toBe(false);

    // Verify telemetry DOM badge contents
    expect(xiaomiResult.labelText).toBe('📡 MI SMART BAND 8: STREAMING');
    expect(xiaomiResult.infoText).toContain('Mi Smart Band 8');
    expect(xiaomiResult.infoText).toContain('85%');
    expect(xiaomiResult.infoText).toContain('10,420 steps');
    expect(xiaomiResult.infoText).toContain('HRV');
    expect(xiaomiResult.infoDisplayBefore).toBe('flex');
    expect(xiaomiResult.spo2InputValue).toBe('97');

    // Verify clean disconnect
    expect(xiaomiResult.infoDisplayAfter).toBe('none');
    expect(xiaomiResult.stateAfter).toBe('DISCONNECTED');
    expect(xiaomiResult.isXiaomiAfter).toBe(false);
  });

  test('should generate standards-compliant HL7 FHIR Release 4 document bundle', async ({ page }) => {
    await loadRamanApp(page);

    const fhirBundle = await page.evaluate(() => {
      const mockProfile = {
        name: 'Raman Dev',
        age: '34',
        gender: 'male',
        blood: 'B+',
        allergies: 'None',
        bp: '120/80',
        heartRate: '78',
        temp: '98.6',
        SpO2: '99',
        steps: 10420,
        deviceModel: 'Mi Smart Band 8'
      };

      const mockSession = {
        healthId: 'RAMAN-TEST-9988',
        condition: 'Migraine',
        icd11: '8A80.0',
        snomed: '37796009',
        medications: [
          { name: 'Sumatriptan 50mg', snomed: '387207008', dose: '1 tablet at onset' }
        ]
      };

      const bundle = window.generateFhirR4Bundle(mockProfile, mockSession);
      return bundle;
    });

    expect(fhirBundle.resourceType).toBe('Bundle');
    expect(fhirBundle.type).toBe('document');
    expect(fhirBundle.identifier.value).toBe('BUNDLE-RAMAN-TEST-9988');

    // Verify bundle resource entries
    const resourceTypes = fhirBundle.entry.map(e => e.resource.resourceType);
    expect(resourceTypes).toContain('Patient');
    expect(resourceTypes).toContain('Condition');
    expect(resourceTypes).toContain('Observation');
    expect(resourceTypes).toContain('MedicationStatement');

    // Check Patient resource
    const patient = fhirBundle.entry.find(e => e.resource.resourceType === 'Patient').resource;
    expect(patient.gender).toBe('male');
    expect(patient.name[0].text).toBe('Raman Dev');

    // Check Condition ICD-11
    const condition = fhirBundle.entry.find(e => e.resource.resourceType === 'Condition').resource;
    expect(condition.code.coding[0].system).toBe('http://id.who.int/icd/release/11/mms');
    expect(condition.code.coding[0].code).toBe('8A80.0');

    // Check Medication SNOMED CT
    const medStatement = fhirBundle.entry.find(e => e.resource.resourceType === 'MedicationStatement').resource;
    expect(medStatement.medicationCodeableConcept.coding[0].system).toBe('http://snomed.info/sct');
    expect(medStatement.medicationCodeableConcept.coding[0].code).toBe('387207008');

    // Check Wearable Steps Observation
    const stepsObs = fhirBundle.entry.find(e => e.resource.resourceType === 'Observation' && e.resource.code.coding[0].code === '55423-8').resource;
    expect(stepsObs.valueQuantity.value).toBe(10420);

    // Check Connected Wearable Device Resource
    const deviceRes = fhirBundle.entry.find(e => e.resource.resourceType === 'Device').resource;
    expect(deviceRes.deviceName[0].name).toBe('Mi Smart Band 8');
    expect(deviceRes.type.coding[0].code).toBe('86184003');
  });

  test('should open ZKP modal, generate cryptographic proof, and verify in-browser', async ({ page }) => {
    await loadRamanApp(page);

    // 1. Open ZKP modal
    await page.evaluate(() => window.openZkpModal());

    // Check modal visibility
    const modalDisplay = await page.$eval('#zkpModal', el => window.getComputedStyle(el).display);
    expect(modalDisplay).not.toBe('none');

    // 2. Select circuit and execute proof generation
    await page.selectOption('#zkpCircuitSelect', 'ALLERGY_ABSENCE');
    await page.click('#btnExecuteZkp');

    // 3. Verify proof result area displays
    await page.waitForFunction(() => {
      const el = document.getElementById('zkpResultArea');
      return el && window.getComputedStyle(el).display !== 'none';
    }, { timeout: 5000 });

    const proofData = await page.evaluate(async () => {
      const statement = document.getElementById('zkpStatementText').textContent;
      const digest = document.getElementById('zkpProofDigest').textContent;

      // Verify mathematically in-browser via RamanZkpProver
      const profile = { allergies: 'None', heartRate: 72, SpO2: 98 };
      const proofPackage = await window.RamanZkpProver.generateProof('ALLERGY_ABSENCE', profile, { allergen: 'penicillin' });
      const verification = window.RamanZkpProver.verifyProof(proofPackage);

      return {
        statement,
        digest,
        verification
      };
    });

    expect(proofData.statement).toContain('penicillin');
    expect(proofData.digest).toContain('π:');
    expect(proofData.verification.isValid).toBe(true);
    expect(proofData.verification.privacyDisclosure).toBe('ZERO_KNOWLEDGE_PRESERVED');
  });

});
