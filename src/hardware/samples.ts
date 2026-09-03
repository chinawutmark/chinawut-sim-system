import { HARDWARE_SCHEMA_VERSION, type ActuatorDefinition, type BoardDefinition, type ComponentDefinition, type PinDefinition, type SensorDefinition } from "./types.js";

const powerPins: readonly PinDefinition[] = [
  { id: "vcc", name: "VCC", direction: "power", capabilities: ["power"] },
  { id: "gnd", name: "GND", direction: "ground", capabilities: ["ground"] },
];
const gpio = (id: string, aliases: readonly string[] = []): PinDefinition => ({ id, name: id.toUpperCase(), aliases, direction: "bidirectional", capabilities: ["gpio", "digital-input", "digital-output", "interrupt", "pwm"] });
const identity = (id: string, name: string, category: string) => ({ id, name, category, schemaVersion: HARDWARE_SCHEMA_VERSION });

export const sampleBoards: readonly BoardDefinition[] = [
  {
    ...identity("espressif.esp32-devkit", "ESP32 DevKit", "development-board"), kind: "board", manufacturer: "Espressif", family: "ESP32", model: "ESP32 DevKit",
    processor: { manufacturer: "Espressif", model: "ESP32", architecture: "Xtensa", cores: 2, wordSizeBits: 32 },
    electrical: { operatingVoltage: { min: 3.0, max: 3.6, unit: "V" }, recommendedSupplyVoltage: { min: 4.5, max: 5.5, unit: "V" } },
    pins: [...powerPins, gpio("gpio21", ["SDA"]), gpio("gpio22", ["SCL"]), gpio("gpio1", ["TX0"]), gpio("gpio3", ["RX0"])],
    interfaces: [{ id: "i2c0", type: "i2c", role: "host", pins: ["gpio21", "gpio22"], instance: "I2C0" }, { id: "uart0", type: "uart", role: "host", pins: ["gpio1", "gpio3"], instance: "UART0" }],
    networking: ["wifi", "bluetooth", "ble"], memory: [{ name: "SRAM", kind: "ram", sizeBytes: 520 * 1024 }], clocks: [{ source: "CPU", frequencyHz: { min: 80e6, max: 240e6, unit: "Hz" }, defaultHz: 240e6 }], peripheralLimits: { uart: 3, spi: 4, i2c: 2 }, restrictions: ["Some pins are sampled during boot; consult the selected module datasheet."],
  },
  {
    ...identity("arduino.uno-r3", "Arduino UNO R3", "development-board"), kind: "board", manufacturer: "Arduino", family: "UNO", model: "R3",
    processor: { manufacturer: "Microchip", model: "ATmega328P", architecture: "AVR", cores: 1, wordSizeBits: 8 }, electrical: { operatingVoltage: { min: 4.5, max: 5.5, unit: "V" }, recommendedSupplyVoltage: { min: 7, max: 12, unit: "V" } },
    pins: [...powerPins, gpio("d0", ["RX"]), gpio("d1", ["TX"]), { ...gpio("a4", ["SDA"]), capabilities: [...gpio("a4").capabilities, "adc", "i2c"] }, { ...gpio("a5", ["SCL"]), capabilities: [...gpio("a5").capabilities, "adc", "i2c"] }],
    interfaces: [{ id: "uart0", type: "uart", role: "host", pins: ["d0", "d1"] }, { id: "i2c0", type: "i2c", role: "host", pins: ["a4", "a5"] }], memory: [{ name: "Flash", kind: "flash", sizeBytes: 32768 }, { name: "SRAM", kind: "ram", sizeBytes: 2048 }], clocks: [{ source: "crystal", frequencyHz: { min: 16e6, max: 16e6, unit: "Hz" }, defaultHz: 16e6 }], peripheralLimits: { uart: 1, i2c: 1, spi: 1 },
  },
  {
    ...identity("generic.mcu", "Generic MCU", "microcontroller"), kind: "board", manufacturer: "Generic", model: "User-configurable MCU", processor: { model: "Generic processor", architecture: "unspecified" }, electrical: {}, pins: [gpio("io0")], interfaces: [{ id: "gpio0", type: "gpio", role: "peer", pins: ["io0"] }], metadata: { template: true },
  },
];

const sensor = (id: string, name: string, category: string, quantity: string, unit: string, min: number, max: number, type: "gpio" | "analog-voltage" | "i2c"): SensorDefinition => ({
  ...identity(id, name, category), kind: "sensor", manufacturer: "Generic", pins: [...powerPins, gpio("signal")], electrical: { supplyVoltage: { min: 3, max: 5.5, unit: "V" } }, interfaces: [{ id: "data", type, role: "device", pins: ["signal"] }], measurements: [{ id: "reading", quantity, unit, range: { min, max, unit } }], faultModes: [{ id: "disconnected", type: "disconnected" }, { id: "noise", type: "noisy-signal" }],
});
export const sampleSensors: readonly SensorDefinition[] = [
  sensor("generic.digital-sensor", "Generic Digital Sensor", "generic", "state", "boolean", 0, 1, "gpio"),
  sensor("generic.analog-sensor", "Generic Analog Sensor", "generic", "normalized signal", "%", 0, 100, "analog-voltage"),
  sensor("generic.temperature-sensor", "Generic Temperature Sensor", "environmental", "temperature", "°C", -40, 125, "i2c"),
  sensor("generic.imu", "Generic IMU / Accelerometer", "motion-position", "acceleration", "m/s²", -156.9064, 156.9064, "i2c"),
  sensor("generic.current-sensor", "Generic Current Sensor", "electrical", "electric current", "A", -30, 30, "analog-voltage"),
  sensor("generic.pressure-sensor", "Generic Pressure Sensor", "mechanical", "pressure", "Pa", 0, 1_000_000, "analog-voltage"),
];

const actuator = (id: string, name: string, category: string, quantity: string, min: number, max: number, unit: string): ActuatorDefinition => ({
  ...identity(id, name, category), kind: "actuator", manufacturer: "Generic", pins: [...powerPins, gpio("control")], electrical: { operatingVoltage: { min: 3, max: 24, unit: "V" } }, interfaces: [{ id: "control", type: "pwm", role: "receiver", pins: ["control"] }], controls: [{ interfaceId: "control", quantity, range: { min, max, unit }, pwm: { minDutyCycle: 0, maxDutyCycle: 1 } }], faultModes: [{ id: "power-loss", type: "power-loss" }, { id: "jam", type: "mechanical-jam" }],
});
export const sampleActuators: readonly ActuatorDefinition[] = [
  actuator("generic.led", "Generic LED", "indicator", "brightness", 0, 100, "%"), actuator("generic.relay", "Generic Relay", "switch", "state", 0, 1, "boolean"), actuator("generic.dc-motor", "Generic DC Motor", "motor", "speed", -100, 100, "%"), actuator("generic.servo", "Generic Servo Motor", "motor", "position", 0, 180, "deg"),
];
export const sampleDefinitions: readonly ComponentDefinition[] = [...sampleBoards, ...sampleSensors, ...sampleActuators];
