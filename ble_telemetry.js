/**
 * RAMAN AI – Native Web Bluetooth (BLE) Telemetry Streaming Engine
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Implements Bluetooth SIG GATT standard profiles:
 * - Heart Rate Service (0x180D) / Measurement (0x2A37)
 * - Heart Rate Control Point (0x2A39) - Continuous optical PPG trigger & 12s ping
 * - Pulse Oximeter Service (0x1822) / PLX Continuous (0x2A5F)
 * - Battery Service (0x180F) / Battery Level (0x2A19)
 * 
 * Comprehensive Xiaomi / Huami / Amazfit / Zepp / Redmi Wearables Support:
 * - Compatible with Mi Smart Band 2, 3, 4, 5, 6, 7, 8, 9, Amazfit & Redmi Watch
 * - Xiaomi Base Service (0xFEE0) & Auth Service (0xFEE1)
 * - Real-time step counter parsing (00000007-0000-3512-2118-0009af100700)
 * - Battery status & charging indicator parsing (00000006-0000-3512-2118-0009af100700)
 * - Optical continuous PPG keep-alive heartbeat ping ([0x16]) every 12 seconds
 */

const XIAOMI_UUIDS = {
  // Base & Auth Services
  SERVICE_FEE0: 0xFEE0,
  SERVICE_FEE0_STR: '0000fee0-0000-1000-8000-00805f9b34fb',
  SERVICE_FEE1: 0xFEE1,
  SERVICE_FEE1_STR: '0000fee1-0000-1000-8000-00805f9b34fb',

  // Real-time Steps & Activity Data
  CHAR_STEPS: '00000007-0000-3512-2118-0009af100700',

  // Battery Status & Charging
  CHAR_BATTERY: '00000006-0000-3512-2118-0009af100700',

  // Heart Rate Control Point (Continuous PPG enable)
  CHAR_HR_CONTROL_POINT: 0x2A39,
  CHAR_HR_CONTROL_POINT_STR: '00002a39-0000-1000-8000-00805f9b34fb',

  // Custom Xiaomi Sensor Control
  CHAR_SENSOR_CONTROL: '00000001-0000-3512-2118-0009af100700'
};

const XIAOMI_COMMANDS = {
  START_CONTINUOUS_HR: new Uint8Array([0x15, 0x01, 0x01]),
  STOP_CONTINUOUS_HR: new Uint8Array([0x15, 0x01, 0x00]),
  PING_HEARTBEAT: new Uint8Array([0x16]),
  START_CONTINUOUS_HR_ALT: new Uint8Array([0x15, 0x02, 0x01])
};

function isXiaomiBrand(deviceName) {
  if (!deviceName || typeof deviceName !== 'string') return false;
  return /mi\s*smart\s*band|mi\s*band|xiaomi|redmi|amazfit|huami|zepp/i.test(deviceName);
}

function parseHeartRateMeasurement(dataView) {
  if (!dataView || dataView.byteLength < 2) return null;
  const flags = dataView.getUint8(0);
  const is16Bit = (flags & 0x01) === 1;
  let heartRate = 0;
  let offset = 1;

  if (is16Bit) {
    if (dataView.byteLength < 3) return null;
    heartRate = dataView.getUint16(offset, true); // Little-endian
    offset += 2;
  } else {
    heartRate = dataView.getUint8(offset);
    offset += 1;
  }

  // Energy Expended (optional)
  let energyExpended = null;
  if ((flags & 0x08) !== 0 && dataView.byteLength >= offset + 2) {
    energyExpended = dataView.getUint16(offset, true);
    offset += 2;
  }

  // RR-Intervals (optional)
  const rrIntervals = [];
  while (offset + 2 <= dataView.byteLength) {
    rrIntervals.push(dataView.getUint16(offset, true));
    offset += 2;
  }

  return {
    heartRate,
    energyExpended,
    rrIntervals,
    timestamp: Date.now()
  };
}

function parseSFloat(val) {
  // SFLOAT format (16-bit: 4-bit exponent, 12-bit mantissa)
  let mantissa = val & 0x0FFF;
  let exponent = (val >> 12) & 0x000F;
  if (exponent >= 0x0008) exponent = -((0x000F + 1) - exponent);
  if (mantissa >= 0x0800) mantissa = -((0x0FFF + 1) - mantissa);
  return mantissa * Math.pow(10, exponent);
}

function calculateHrvMetrics(rrIntervals) {
  if (!rrIntervals || rrIntervals.length < 2) return null;
  let sumSquares = 0;
  for (let i = 1; i < rrIntervals.length; i++) {
    const diff = rrIntervals[i] - rrIntervals[i - 1];
    sumSquares += diff * diff;
  }
  const rmssd = Math.round(Math.sqrt(sumSquares / (rrIntervals.length - 1)));
  return {
    rmssd,
    timestamp: Date.now()
  };
}

function parsePulseOximeterMeasurement(dataView) {
  if (!dataView || dataView.byteLength < 4) return null;
  const flags = dataView.getUint8(0);
  
  // Standard PLX Continuous format: SpO2 SFLOAT (Bytes 1-2), Pulse Rate SFLOAT (Bytes 3-4)
  const rawSpo2 = dataView.getUint16(1, true);
  const rawPulse = dataView.getUint16(3, true);
  
  let spo2 = parseSFloat(rawSpo2);
  let pulseRate = parseSFloat(rawPulse);

  // Bounds sanity check for medical telemetry
  if (spo2 < 50 || spo2 > 100) spo2 = Math.min(100, Math.max(70, Math.round(spo2)));
  if (pulseRate < 30 || pulseRate > 240) pulseRate = Math.min(220, Math.max(40, Math.round(pulseRate)));

  return {
    spo2: Math.round(spo2),
    pulseRate: Math.round(pulseRate),
    timestamp: Date.now()
  };
}

function parseXiaomiSteps(dataView) {
  if (!dataView || dataView.byteLength < 4) return null;
  // Steps count (32-bit uint, little-endian)
  const steps = dataView.getUint32(0, true);
  
  let distanceMeters = 0;
  let calories = 0;
  
  if (dataView.byteLength >= 8) {
    distanceMeters = dataView.getUint32(4, true);
  }
  if (dataView.byteLength >= 12) {
    calories = dataView.getUint32(8, true);
  }
  
  return {
    steps: Math.min(1000000, Math.max(0, steps)),
    distanceMeters,
    calories,
    timestamp: Date.now()
  };
}

function parseXiaomiBattery(dataView) {
  if (!dataView || dataView.byteLength < 1) return null;
  let level = 0;
  let isCharging = false;
  
  if (dataView.byteLength >= 2) {
    // Xiaomi proprietary 0x0006 layout: Byte 1 = battery %, Byte 2 = charging state
    level = dataView.getUint8(1);
    if (dataView.byteLength >= 3) {
      isCharging = dataView.getUint8(2) === 1;
    }
  } else {
    // Standard GATT 0x2A19 layout: Byte 0 = level %
    level = dataView.getUint8(0);
  }
  
  level = Math.min(100, Math.max(0, level));
  return {
    level,
    isCharging,
    timestamp: Date.now()
  };
}

function parseXiaomiSpO2(dataView) {
  if (!dataView || dataView.byteLength < 2) return null;
  // Many Xiaomi/Amazfit models send SpO2 as [flags/header, spo2Percentage] or 5-byte PLX
  if (dataView.byteLength >= 4) {
    const plx = parsePulseOximeterMeasurement(dataView);
    if (plx && plx.spo2 >= 50 && plx.spo2 <= 100) return plx;
  }
  
  let spo2 = dataView.getUint8(1);
  if (spo2 < 50 || spo2 > 100) {
    spo2 = dataView.getUint8(0);
  }
  if (spo2 < 50 || spo2 > 100) return null;
  return {
    spo2,
    timestamp: Date.now()
  };
}

class RamanBleManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.spo2Characteristic = null;
    this.hrControlPointChar = null;
    this.stepsCharacteristic = null;
    this.batteryCharacteristic = null;
    this.state = "DISCONNECTED"; // DISCONNECTED | CONNECTING | STREAMING | RECONNECTING
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimer = null;

    // Xiaomi Wearables Specific State
    this.isXiaomiDevice = false;
    this.deviceModel = null;
    this.steps = 0;
    this.distanceMeters = 0;
    this.calories = 0;
    this.batteryLevel = null;
    this.isCharging = false;
    this.xiaomiPingTimer = null;
    this.lastHrv = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth !== 'undefined';
  }

  onTelemetry(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  broadcast(telemetry) {
    for (const cb of this.listeners) {
      try { cb(telemetry); } catch (e) { console.error("BLE telemetry callback error:", e); }
    }
  }

  setState(newState, detail = "") {
    this.state = newState;
    this.broadcast({ type: "STATUS_CHANGE", state: newState, detail });
    this.updateDomPill();
  }

  updateWearableInfoBadge() {
    if (typeof document === 'undefined') return;
    const infoEl = document.getElementById("bleWearableInfo");
    if (!infoEl) return;

    if (this.state !== "STREAMING") {
      infoEl.style.display = "none";
      return;
    }

    const parts = [];
    if (this.isXiaomiDevice) {
      parts.push(`⌚ ${this.deviceModel || "Xiaomi Band"}`);
    }
    if (this.batteryLevel !== null) {
      parts.push(`🔋 ${this.batteryLevel}%${this.isCharging ? ' ⚡' : ''}`);
    }
    if (this.steps > 0) {
      parts.push(`👟 ${this.steps.toLocaleString()} steps`);
    }
    if (this.lastHrv !== null && this.lastHrv > 0) {
      parts.push(`💓 HRV ${this.lastHrv}ms`);
    }

    if (parts.length > 0) {
      infoEl.textContent = parts.join(" | ");
      infoEl.style.display = "flex";
    } else {
      infoEl.style.display = "none";
    }
  }

  updateDomPill() {
    if (typeof document === 'undefined') return;
    const pill = document.getElementById("bleStatusPill");
    const label = document.getElementById("bleStatusLabel");
    if (!pill || !label) return;

    pill.className = "ble-pill " + this.state.toLowerCase();
    switch (this.state) {
      case "STREAMING":
        if (this.isXiaomiDevice) {
          const brandTitle = (this.deviceModel || "XIAOMI").toUpperCase();
          label.textContent = `📡 ${brandTitle}: STREAMING`;
        } else {
          label.textContent = "📡 BLE: STREAMING";
        }
        break;
      case "CONNECTING":
        label.textContent = "🔄 BLE: PAIRING...";
        break;
      case "RECONNECTING":
        label.textContent = `⚠️ BLE: RETRY (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
        break;
      default:
        label.textContent = "📡 BLE: CONNECT WEARABLE";
    }
    this.updateWearableInfoBadge();
  }

  async connect() {
    if (!this.isSupported()) {
      alert("Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or a Web Bluetooth compatible browser on HTTPS/localhost.");
      return false;
    }

    try {
      this.setState("CONNECTING");

      const filters = [
        { services: ['heart_rate'] },
        { services: ['pulse_oximeter'] },
        { services: [XIAOMI_UUIDS.SERVICE_FEE0] },
        { services: [XIAOMI_UUIDS.SERVICE_FEE1] },
        { namePrefix: 'Mi ' },
        { namePrefix: 'Mi Smart Band' },
        { namePrefix: 'Xiaomi' },
        { namePrefix: 'Redmi' },
        { namePrefix: 'Amazfit' },
        { namePrefix: 'Huami' },
        { namePrefix: 'Zepp' },
        { namePrefix: 'Band' }
      ];

      const optionalServices = [
        'heart_rate',
        'pulse_oximeter',
        'battery_service',
        'device_information',
        0x180D,
        0x1822,
        0x180F,
        0x180A,
        0x1800,
        0x1801,
        XIAOMI_UUIDS.SERVICE_FEE0,
        XIAOMI_UUIDS.SERVICE_FEE0_STR,
        XIAOMI_UUIDS.SERVICE_FEE1,
        XIAOMI_UUIDS.SERVICE_FEE1_STR
      ];

      this.device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices
      });

      const devName = this.device.name || "";
      this.isXiaomiDevice = isXiaomiBrand(devName);
      this.deviceModel = devName || (this.isXiaomiDevice ? "Xiaomi Wearable" : "BLE Device");

      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());

      this.server = await this.device.gatt.connect();
      await this.subscribeToServices();

      this.reconnectAttempts = 0;
      this.setState("STREAMING");
      if (typeof window !== 'undefined' && window.BioTelemetrySFX) {
        window.BioTelemetrySFX.playSuccess();
      }
      return true;
    } catch (err) {
      console.warn("BLE connection cancelled or failed:", err);
      this.setState("DISCONNECTED", err.message);
      return false;
    }
  }

  handleHeartRateMeasurement(dataView) {
    const parsed = parseHeartRateMeasurement(dataView);
    if (parsed) {
      this.applyHeartRateToInputs(parsed.heartRate);
      if (parsed.rrIntervals && parsed.rrIntervals.length >= 2) {
        const hrv = calculateHrvMetrics(parsed.rrIntervals);
        if (hrv) {
          this.lastHrv = hrv.rmssd;
          this.broadcast({ type: "HRV", ...hrv });
        }
      }
      this.broadcast({ type: "HEART_RATE", ...parsed });
      this.updateWearableInfoBadge();
    }
    return parsed;
  }

  handlePulseOximeterMeasurement(dataView) {
    const parsed = parsePulseOximeterMeasurement(dataView);
    if (parsed) {
      this.applySpO2ToInputs(parsed.spo2, parsed.pulseRate);
      this.broadcast({ type: "PULSE_OX", ...parsed });
    }
    return parsed;
  }

  handleXiaomiSteps(dataView) {
    const parsed = parseXiaomiSteps(dataView);
    if (parsed) {
      this.steps = parsed.steps;
      this.distanceMeters = parsed.distanceMeters;
      this.calories = parsed.calories;
      this.broadcast({ type: "STEPS", ...parsed });
      this.updateWearableInfoBadge();
    }
    return parsed;
  }

  handleXiaomiBattery(dataView) {
    const parsed = parseXiaomiBattery(dataView);
    if (parsed) {
      this.batteryLevel = parsed.level;
      this.isCharging = parsed.isCharging;
      this.broadcast({ type: "BATTERY", ...parsed });
      this.updateWearableInfoBadge();
    }
    return parsed;
  }

  handleXiaomiSpO2(dataView) {
    const parsed = parseXiaomiSpO2(dataView);
    if (parsed) {
      this.applySpO2ToInputs(parsed.spo2);
      this.broadcast({ type: "PULSE_OX", ...parsed });
    }
    return parsed;
  }

  async activateContinuousHeartRate() {
    if (!this.hrControlPointChar) return;
    try {
      if (typeof this.hrControlPointChar.writeValueWithResponse === 'function') {
        await this.hrControlPointChar.writeValueWithResponse(XIAOMI_COMMANDS.START_CONTINUOUS_HR);
      } else if (typeof this.hrControlPointChar.writeValueWithoutResponse === 'function') {
        await this.hrControlPointChar.writeValueWithoutResponse(XIAOMI_COMMANDS.START_CONTINUOUS_HR);
      } else if (typeof this.hrControlPointChar.writeValue === 'function') {
        await this.hrControlPointChar.writeValue(XIAOMI_COMMANDS.START_CONTINUOUS_HR);
      }
      console.log("BLE Xiaomi: Optical continuous PPG measurement activated.");
      this.startXiaomiPingTimer();
    } catch (e) {
      console.warn("BLE Xiaomi: Continuous HR activation command failed:", e.message);
    }
  }

  startXiaomiPingTimer() {
    this.stopXiaomiPingTimer();
    // Xiaomi devices require keep-alive ping packet every 12 seconds
    this.xiaomiPingTimer = setInterval(async () => {
      if (this.hrControlPointChar && this.server && this.server.connected) {
        try {
          if (typeof this.hrControlPointChar.writeValueWithoutResponse === 'function') {
            await this.hrControlPointChar.writeValueWithoutResponse(XIAOMI_COMMANDS.PING_HEARTBEAT);
          } else if (typeof this.hrControlPointChar.writeValue === 'function') {
            await this.hrControlPointChar.writeValue(XIAOMI_COMMANDS.PING_HEARTBEAT);
          }
        } catch (pingErr) {
          console.warn("BLE Xiaomi: Ping keep-alive failed:", pingErr.message);
        }
      }
    }, 12000);
  }

  stopXiaomiPingTimer() {
    if (this.xiaomiPingTimer) {
      clearInterval(this.xiaomiPingTimer);
      this.xiaomiPingTimer = null;
    }
  }

  async deactivateContinuousHeartRate() {
    this.stopXiaomiPingTimer();
    if (this.hrControlPointChar && this.server && this.server.connected) {
      try {
        if (typeof this.hrControlPointChar.writeValueWithoutResponse === 'function') {
          await this.hrControlPointChar.writeValueWithoutResponse(XIAOMI_COMMANDS.STOP_CONTINUOUS_HR);
        } else if (typeof this.hrControlPointChar.writeValue === 'function') {
          await this.hrControlPointChar.writeValue(XIAOMI_COMMANDS.STOP_CONTINUOUS_HR);
        }
      } catch (_) {}
    }
  }

  async subscribeToServices() {
    if (!this.server) return;

    // 1. Subscribe to Heart Rate (0x180D / 0x2A37)
    try {
      const hrService = await this.server.getPrimaryService('heart_rate');
      this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
      await this.hrCharacteristic.startNotifications();
      this.hrCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
        this.handleHeartRateMeasurement(e.target.value);
      });

      // Check for Heart Rate Control Point (0x2A39) for continuous optical PPG activation
      try {
        this.hrControlPointChar = await hrService.getCharacteristic(XIAOMI_UUIDS.CHAR_HR_CONTROL_POINT);
        await this.activateContinuousHeartRate();
      } catch (cpErr) {
        console.log("BLE: Heart Rate Control Point not present or continuous mode direct:", cpErr.message);
      }
    } catch (e) {
      console.log("BLE: Heart Rate service not available on device:", e.message);
    }

    // 2. Subscribe to Pulse Oximeter (0x1822 / 0x2A5F)
    try {
      const spo2Service = await this.server.getPrimaryService('pulse_oximeter');
      this.spo2Characteristic = await spo2Service.getCharacteristic(0x2A5F);
      await this.spo2Characteristic.startNotifications();
      this.spo2Characteristic.addEventListener('characteristicvaluechanged', (e) => {
        this.handlePulseOximeterMeasurement(e.target.value);
      });
    } catch (e) {
      console.log("BLE: Pulse Oximeter service not available on device:", e.message);
    }

    // 3. Subscribe to Xiaomi / Huami Proprietary Service (0xFEE0)
    try {
      let fee0Service = null;
      try {
        fee0Service = await this.server.getPrimaryService(XIAOMI_UUIDS.SERVICE_FEE0);
      } catch (err1) {
        try {
          fee0Service = await this.server.getPrimaryService(XIAOMI_UUIDS.SERVICE_FEE0_STR);
        } catch (err2) {}
      }

      if (fee0Service) {
        this.isXiaomiDevice = true;

        // Subscribe to Realtime Steps Characteristic
        try {
          this.stepsCharacteristic = await fee0Service.getCharacteristic(XIAOMI_UUIDS.CHAR_STEPS);
          await this.stepsCharacteristic.startNotifications();
          this.stepsCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
            this.handleXiaomiSteps(e.target.value);
          });
          try {
            const initSteps = await this.stepsCharacteristic.readValue();
            this.handleXiaomiSteps(initSteps);
          } catch (_) {}
        } catch (stErr) {
          console.log("BLE Xiaomi: Steps characteristic not found:", stErr.message);
        }

        // Subscribe to Battery Status Characteristic
        try {
          this.batteryCharacteristic = await fee0Service.getCharacteristic(XIAOMI_UUIDS.CHAR_BATTERY);
          await this.batteryCharacteristic.startNotifications();
          this.batteryCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
            this.handleXiaomiBattery(e.target.value);
          });
          try {
            const initBat = await this.batteryCharacteristic.readValue();
            this.handleXiaomiBattery(initBat);
          } catch (_) {}
        } catch (btErr) {
          console.log("BLE Xiaomi: Battery characteristic not found:", btErr.message);
        }
      }
    } catch (e) {
      console.log("BLE: 0xFEE0 service not available on device:", e.message);
    }

    // 4. Standard Battery Service Fallback (0x180F / 0x2A19)
    if (this.batteryLevel === null) {
      try {
        const batService = await this.server.getPrimaryService('battery_service');
        const batChar = await batService.getCharacteristic(0x2A19);
        try {
          const val = await batChar.readValue();
          this.handleXiaomiBattery(val);
        } catch (_) {}
        batChar.addEventListener('characteristicvaluechanged', (e) => {
          this.handleXiaomiBattery(e.target.value);
        });
        await batChar.startNotifications();
      } catch (_) {}
    }
  }

  applyHeartRateToInputs(hr) {
    if (typeof document === 'undefined') return;
    const hrEl = document.getElementById("patientHR");
    if (hrEl) {
      hrEl.value = hr;
      hrEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window !== 'undefined') {
      if (typeof window.updateOscilloscopeHeartRate === 'function') {
        window.updateOscilloscopeHeartRate(hr);
      }
      if (typeof window.drawOscilloscopeWaveform === 'function') {
        window.drawOscilloscopeWaveform(hr);
      }
    }
  }

  applySpO2ToInputs(spo2, pulseRate) {
    if (typeof document === 'undefined') return;
    const spo2El = document.getElementById("patientSpO2");
    if (spo2El) {
      spo2El.value = spo2;
      spo2El.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (pulseRate) {
      this.applyHeartRateToInputs(pulseRate);
    }
  }

  async handleDisconnect() {
    this.stopXiaomiPingTimer();
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoffMs = Math.pow(2, this.reconnectAttempts - 1) * 1000;
      this.setState("RECONNECTING", `Attempt ${this.reconnectAttempts} in ${backoffMs}ms`);

      this.reconnectTimer = setTimeout(async () => {
        try {
          if (this.device && this.device.gatt) {
            this.server = await this.device.gatt.connect();
            await this.subscribeToServices();
            this.setState("STREAMING");
            this.reconnectAttempts = 0;
          }
        } catch (e) {
          this.handleDisconnect();
        }
      }, backoffMs);
    } else {
      this.setState("DISCONNECTED", "Max reconnect attempts reached.");
      if (typeof window !== 'undefined' && window.BioTelemetrySFX) {
        window.BioTelemetrySFX.playError();
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.deactivateContinuousHeartRate();
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.isXiaomiDevice = false;
    this.deviceModel = null;
    this.steps = 0;
    this.distanceMeters = 0;
    this.calories = 0;
    this.batteryLevel = null;
    this.lastHrv = null;
    this.setState("DISCONNECTED");
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.RamanBleManager = RamanBleManager;
  window.ramanBle = new RamanBleManager();
  window.parseHeartRateMeasurement = parseHeartRateMeasurement;
  window.parsePulseOximeterMeasurement = parsePulseOximeterMeasurement;
  window.parseXiaomiSteps = parseXiaomiSteps;
  window.parseXiaomiBattery = parseXiaomiBattery;
  window.parseXiaomiSpO2 = parseXiaomiSpO2;
  window.calculateHrvMetrics = calculateHrvMetrics;
  window.isXiaomiBrand = isXiaomiBrand;
  window.XIAOMI_UUIDS = XIAOMI_UUIDS;
  window.XIAOMI_COMMANDS = XIAOMI_COMMANDS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanBleManager,
    parseHeartRateMeasurement,
    parsePulseOximeterMeasurement,
    parseXiaomiSteps,
    parseXiaomiBattery,
    parseXiaomiSpO2,
    calculateHrvMetrics,
    isXiaomiBrand,
    parseSFloat,
    XIAOMI_UUIDS,
    XIAOMI_COMMANDS
  };
}
