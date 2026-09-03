import test from "node:test";
import assert from "node:assert/strict";
import {
  ComponentRegistry,
  HARDWARE_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  createInstance,
  loadProject,
  serializeProject,
  validateProject,
  type BoardDefinition,
  type CustomComponentDefinition,
  type Net,
  type PinDefinition,
  type Project,
  type SensorDefinition,
} from "../src/index.js";

const pin = (
  id: string,
  direction: PinDefinition["direction"],
  capabilities: PinDefinition["capabilities"],
  voltage?: { min: number; max: number },
): PinDefinition => ({
  id,
  name: id.toUpperCase(),
  direction,
  capabilities,
  ...(voltage ? {
    voltageRange: { ...voltage, unit: "V" },
    voltageTolerance: { ...voltage, unit: "V" },
  } : {}),
});

const board: BoardDefinition = {
  id: "test.board",
  schemaVersion: HARDWARE_SCHEMA_VERSION,
  kind: "board",
  name: "Test MCU Board",
  category: "development-board",
  processor: { model: "Test MCU", architecture: "test" },
  electrical: { supplyVoltage: { min: 3, max: 3.6, unit: "V" } },
  pins: [
    pin("gpio18", "output", ["gpio", "digital-output", "pwm"], { min: 0, max: 3.3 }),
    pin("gpio19", "input", ["gpio", "digital-input", "interrupt"], { min: 0, max: 3.3 }),
    pin("gpio34", "input", ["gpio", "digital-input", "adc"], { min: 0, max: 3.3 }),
    pin("tx", "output", ["uart"], { min: 0, max: 3.3 }),
    pin("rx", "input", ["uart"], { min: 0, max: 3.3 }),
    pin("sda", "bidirectional", ["i2c"], { min: 0, max: 3.3 }),
    pin("scl", "bidirectional", ["i2c"], { min: 0, max: 3.3 }),
    pin("vcc", "power", ["power"], { min: 3, max: 3.6 }),
    pin("gnd", "ground", ["ground"]),
  ],
  interfaces: [
    { id: "uart0", type: "uart", role: "host", pins: ["tx", "rx"] },
    { id: "i2c0", type: "i2c", role: "host", pins: ["sda", "scl"] },
  ],
};

const temperature: SensorDefinition = {
  id: "test.temperature",
  schemaVersion: HARDWARE_SCHEMA_VERSION,
  kind: "sensor",
  name: "I2C Temperature Sensor",
  category: "environmental",
  electrical: { supplyVoltage: { min: 3, max: 5, unit: "V" } },
  pins: [
    pin("sda", "bidirectional", ["i2c"], { min: 0, max: 3.3 }),
    pin("scl", "input", ["i2c"], { min: 0, max: 3.3 }),
    pin("vcc", "power", ["power"], { min: 3, max: 5 }),
    pin("gnd", "ground", ["ground"]),
  ],
  interfaces: [{ id: "i2c", type: "i2c", role: "device", pins: ["sda", "scl"] }],
  measurements: [{ id: "temperature", quantity: "temperature", unit: "°C", range: { min: -40, max: 125, unit: "°C" } }],
};

const analogSensor: SensorDefinition = {
  id: "test.analog-pressure",
  schemaVersion: HARDWARE_SCHEMA_VERSION,
  kind: "sensor",
  name: "Analog Pressure Sensor",
  category: "mechanical",
  electrical: {},
  pins: [pin("out", "output", ["dac"], { min: 0, max: 3.3 })],
  interfaces: [{ id: "analog", type: "analog-voltage", role: "transmitter", pins: ["out"] }],
  measurements: [{ id: "pressure", quantity: "pressure", unit: "Pa", range: { min: 0, max: 1_000_000, unit: "Pa" } }],
};

const customLed: CustomComponentDefinition = {
  id: "test.custom-led",
  schemaVersion: HARDWARE_SCHEMA_VERSION,
  kind: "custom",
  name: "Custom LED",
  category: "custom-indicator",
  electrical: {},
  pins: [pin("signal", "input", ["gpio", "digital-input"], { min: 0, max: 3.3 })],
  interfaces: [{ id: "gpio", type: "gpio", role: "receiver", pins: ["signal"] }],
};

const fiveVoltSource: CustomComponentDefinition = {
  id: "test.five-volt-output",
  schemaVersion: HARDWARE_SCHEMA_VERSION,
  kind: "custom",
  name: "5V Logic Source",
  category: "test-source",
  electrical: {},
  pins: [pin("out", "output", ["gpio", "digital-output"], { min: 0, max: 5 })],
  interfaces: [{ id: "gpio", type: "gpio", role: "transmitter", pins: ["out"] }],
};

const registry = new ComponentRegistry().registerAll([board, temperature, analogSensor, customLed, fiveVoltSource]);

const endpoint = (instanceId: string, endpointId: string, fn?: import("../src/index.js").EndpointFunction) => ({
  instanceId,
  endpointKind: "pin" as const,
  endpointId,
  ...(fn ? { function: fn } : {}),
});

function makeProject(): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "sample",
    name: "Sample project",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    instances: [
      createInstance("mcu", "test.board", "MCU-01"),
      createInstance("temp1", "test.temperature", "Temperature-01"),
    ],
    nets: [
      {
        id: "3v3",
        projectId: "sample",
        name: "3.3 V",
        domain: "electrical",
        type: "regulated-power",
        enabled: true,
        metadata: { voltage: 3.3 },
        endpoints: [endpoint("mcu", "vcc", "power"), endpoint("temp1", "vcc", "power")],
      },
      {
        id: "gnd",
        projectId: "sample",
        name: "GND",
        domain: "electrical",
        type: "ground",
        enabled: true,
        endpoints: [endpoint("mcu", "gnd", "ground"), endpoint("temp1", "gnd", "ground")],
      },
    ],
  };
}

const net = (id: string, type: Net["type"], endpoints: Net["endpoints"], extra: Partial<Net> = {}): Net => ({
  id,
  projectId: "sample",
  name: id,
  domain: "physical",
  type,
  endpoints,
  enabled: true,
  ...extra,
});
const codes = (project: Project) => validateProject(project, registry).map((item) => item.code);
const mcu = (project: Project) => project.instances.find((item) => item.id === "mcu")!;

test("valid digital input connection", () => {
  const project = makeProject();
  project.instances.push(createInstance("led", "test.custom-led", "LED-01"));
  project.nets.push(net("digital", "digital", [endpoint("mcu", "gpio18", "digital-output"), endpoint("led", "signal", "digital-input")]));
  assert.ok(!codes(project).includes("INTERFACE_MISMATCH"));
});

test("valid analog output to ADC", () => {
  const project = makeProject();
  project.instances.push(createInstance("pressure", "test.analog-pressure", "Pressure-01"));
  project.nets.push(net("adc", "analog", [endpoint("pressure", "out", "analog-output"), endpoint("mcu", "gpio34", "analog-input")]));
  assert.ok(!codes(project).includes("INTERFACE_MISMATCH"));
});

test("rejects analog output to non-ADC pin", () => {
  const project = makeProject();
  project.instances.push(createInstance("pressure", "test.analog-pressure", "Pressure-01"));
  project.nets.push(net("adc", "analog", [endpoint("pressure", "out", "analog-output"), endpoint("mcu", "gpio19", "analog-input")]));
  assert.ok(codes(project).includes("INTERFACE_MISMATCH"));
});

test("validates PWM pin capability", () => {
  const project = makeProject();
  mcu(project).pinAssignments.push({ id: "pwm", signal: "MOTOR_PWM", pinId: "gpio19", function: "pwm" });
  assert.ok(codes(project).includes("PIN_CAPABILITY_CONFLICT"));
});

test("rejects incompatible duplicate pin assignments", () => {
  const project = makeProject();
  mcu(project).pinAssignments.push(
    { id: "a", signal: "LED", pinId: "gpio18", function: "digital-output" },
    { id: "b", signal: "MOTOR", pinId: "gpio18", function: "pwm" },
  );
  assert.ok(codes(project).includes("DUPLICATE_PIN_ASSIGNMENT"));
});

test("supports I2C multi-device bus and detects duplicate addresses", () => {
  const project = makeProject();
  project.instances.push(createInstance("temp2", "test.temperature", "Temperature-02"));
  const bus = net("i2c", "i2c", [
    endpoint("mcu", "sda", "i2c-sda"),
    endpoint("temp1", "sda", "i2c-sda"),
    endpoint("temp2", "sda", "i2c-sda"),
  ], { domain: "bus", configuration: { speedHz: 400_000, addresses: { temp1: 0x48, temp2: 0x49 } } });
  project.nets.push(bus);
  assert.ok(!codes(project).includes("DUPLICATE_I2C_ADDRESS"));
  bus.configuration = { addresses: { temp1: 0x48, temp2: 0x48 } };
  assert.ok(codes(project).includes("DUPLICATE_I2C_ADDRESS"));
});

test("accepts UART TX/RX mapping", () => {
  const project = makeProject();
  project.nets.push(net("uart", "uart", [
    { ...endpoint("mcu", "tx", "uart-tx"), configuration: { uart: { baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1 } } },
    { ...endpoint("mcu", "rx", "uart-rx"), configuration: { uart: { baudRate: 115200, dataBits: 8, parity: "none", stopBits: 1 } } },
  ], { domain: "bus" }));
  assert.ok(!codes(project).includes("UART_PAIR_MISSING"));
  assert.ok(!codes(project).includes("UART_CONFIG_MISMATCH"));
});

test("detects UART configuration mismatch", () => {
  const project = makeProject();
  project.nets.push(net("uart", "uart", [
    { ...endpoint("mcu", "tx", "uart-tx"), configuration: { uart: { baudRate: 115200 } } },
    { ...endpoint("mcu", "rx", "uart-rx"), configuration: { uart: { baudRate: 9600 } } },
  ], { domain: "bus" }));
  assert.ok(codes(project).includes("UART_CONFIG_MISMATCH"));
});

test("detects voltage incompatibility", () => {
  const project = makeProject();
  project.instances.push(createInstance("source", "test.five-volt-output", "5V Source"));
  project.nets.push(net("overvoltage", "digital", [endpoint("source", "out", "digital-output"), endpoint("mcu", "gpio19", "digital-input")]));
  assert.ok(codes(project).includes("VOLTAGE_INCOMPATIBLE"));
});

test("valid power/ground nets and missing required power", () => {
  const project = makeProject();
  assert.ok(!codes(project).includes("MISSING_REQUIRED_POWER"));
  project.nets = project.nets.filter((item) => item.id !== "3v3");
  assert.equal(codes(project).filter((code) => code === "MISSING_REQUIRED_POWER").length, 2);
});

test("multiple instances can reference one hardware definition", () => {
  const project = makeProject();
  project.instances.push(createInstance("mcu2", "test.board", "MCU-02"));
  assert.equal(project.instances.filter((item) => item.definitionId === "test.board").length, 2);
});

test("custom components use the same endpoint/net model", () => {
  const project = makeProject();
  project.instances.push(createInstance("led", "test.custom-led", "LED-01"));
  project.nets.push(net("led", "digital", [endpoint("mcu", "gpio18", "digital-output"), endpoint("led", "signal", "digital-input")]));
  assert.ok(!codes(project).includes("INTERFACE_MISMATCH"));
});

test("missing component definition is reported without throwing", () => {
  const project = makeProject();
  project.instances.push(createInstance("ghost", "missing.definition", "Unknown"));
  assert.ok(codes(project).includes("MISSING_DEFINITION"));
});

test("project serialization is deterministic and load is defensive", () => {
  const project = makeProject();
  const first = serializeProject(project);
  project.instances.reverse();
  project.nets.reverse();
  assert.equal(serializeProject(project), first);
  const loaded = loadProject(first, registry);
  assert.equal(loaded.project?.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(loaded.issues.length, 0);
  assert.equal(loadProject("{", registry).issues[0]?.code, "INVALID_JSON");
});

test("warns when physically connected grounded devices lack common ground", () => {
  const project = makeProject();
  project.nets = project.nets.filter((item) => item.type !== "ground");
  project.nets.push(net("i2c", "i2c", [endpoint("mcu", "sda", "i2c-sda"), endpoint("temp1", "sda", "i2c-sda")], { domain: "bus" }));
  assert.ok(codes(project).includes("MISSING_COMMON_GROUND"));
});
