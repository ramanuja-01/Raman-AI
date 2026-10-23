/**
 * RAMAN AI – Native Web Bluetooth (BLE) Telemetry Streaming Engine
 * Experiment No. 170: Offline Client-Side Diagnostic Sandbox
 * 
 * Implements Bluetooth SIG GATT standard profiles:
 * - Heart Rate Service (0x180D) / Measurement (0x2A37)
 * - Pulse Oximeter Service (0x1822) / PLX Continuous (0x2A5F)
 */

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

class RamanBleManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.spo2Characteristic = null;
    this.state = "DISCONNECTED"; // DISCONNECTED | CONNECTING | STREAMING | RECONNECTING
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimer = null;
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

  updateDomPill() {
    if (typeof document === 'undefined') return;
    const pill = document.getElementById("bleStatusPill");
    const label = document.getElementById("bleStatusLabel");
    if (!pill || !label) return;

    pill.className = "ble-pill " + this.state.toLowerCase();
    switch (this.state) {
      case "STREAMING":
        label.textContent = "📡 BLE: STREAMING";
        break;
      case "CONNECTING":
        label.textContent = "🔄 BLE: PAIRING...";
        break;
      case "RECONNECTING":
        label.textContent = `⚠️ BLE: RETRY (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
        break;
      default:
        label.textContent = "📡 BLE: CONNECT";
    }
  }

  async connect() {
    if (!this.isSupported()) {
      alert("Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or a Web Bluetooth compatible browser on HTTPS/localhost.");
      return false;
    }

    try {
      this.setState("CONNECTING");

      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { services: ['pulse_oximeter'] }
        ],
        optionalServices: ['battery_service', 0x180D, 0x1822]
      });

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
      this.broadcast({ type: "HEART_RATE", ...parsed });
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
  }

  applyHeartRateToInputs(hr) {
    if (typeof document === 'undefined') return;
    const hrEl = document.getElementById("patientHR");
    if (hrEl) {
      hrEl.value = hr;
      hrEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window !== 'undefined' && typeof window.drawOscilloscopeWaveform === 'function') {
      window.drawOscilloscopeWaveform(hr);
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
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.setState("DISCONNECTED");
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.RamanBleManager = RamanBleManager;
  window.ramanBle = new RamanBleManager();
  window.parseHeartRateMeasurement = parseHeartRateMeasurement;
  window.parsePulseOximeterMeasurement = parsePulseOximeterMeasurement;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RamanBleManager,
    parseHeartRateMeasurement,
    parsePulseOximeterMeasurement,
    parseSFloat
  };
}
