import test from "node:test";
import assert from "node:assert/strict";
import { ComponentRegistry, DefinitionValidationError, DuplicateComponentIdError, HARDWARE_SCHEMA_VERSION, sampleDefinitions, validateDefinition, type CustomComponentDefinition, type SensorDefinition } from "../src/hardware/index.js";

test("sample catalog validates and supports indexed searches", () => {
  const registry = new ComponentRegistry().registerAll(sampleDefinitions);
  assert.equal(registry.size, 13);
  assert.equal(registry.require("espressif.esp32-devkit").kind, "board");
  assert.equal(registry.search({ kind: "sensor" }).length, 6);
  assert.equal(registry.search({ manufacturer: "generic", category: "motor" }).length, 2);
});
test("registry rejects duplicate IDs", () => {
  const registry = new ComponentRegistry().register(sampleDefinitions[0]!);
  assert.throws(() => registry.register(sampleDefinitions[0]!), DuplicateComponentIdError);
});
test("validation detects invalid ranges, units, pins, and interfaces", () => {
  const invalid: SensorDefinition = { ...sampleDefinitions.find(v => v.id === "generic.temperature-sensor")! as SensorDefinition, id: "Bad ID", pins: [{ id: "x", name: "X", aliases: ["X"], direction: "input", capabilities: ["gpio"] }], interfaces: [{ id: "data", type: "i2c", role: "device", pins: ["missing"], protocolMetadata: { i2c: { addresses: [128] } } }], measurements: [{ id: "m", quantity: "temperature", unit: "°C", range: { min: 10, max: -10, unit: "K" } }] };
  const codes = validateDefinition(invalid).map(value => value.code);
  assert.deepEqual(new Set(codes), new Set(["invalid-id", "duplicate-pin", "unknown-pin", "invalid-address", "invalid-range", "unit-mismatch"]));
  assert.throws(() => new ComponentRegistry().register(invalid), DefinitionValidationError);
});
test("custom components share pins, measurements, simulation and faults", () => {
  const custom: CustomComponentDefinition = { id: "custom.pantograph-force", schemaVersion: HARDWARE_SCHEMA_VERSION, kind: "custom", name: "Pantograph Contact Force Sensor", category: "railway-sensor", pins: [{ id: "out", name: "OUT", direction: "output", capabilities: ["dac"] }], electrical: { supplyVoltage: { min: 3.3, max: 3.3, unit: "V" } }, interfaces: [{ id: "analog", type: "analog-voltage", role: "transmitter", pins: ["out"], electrical: { outputVoltage: { min: 0, max: 3.3, unit: "V" } } }], measurements: [{ id: "force", quantity: "force", unit: "N", range: { min: 0, max: 200, unit: "N" }, accuracy: { value: 1, unit: "%" }, sampleRateHz: { min: 100, max: 100, unit: "Hz" } }], simulation: { noise: { value: 0.1, unit: "N" }, drift: { value: 0.1, unit: "N/h" } }, faultModes: [{ id: "drift", type: "drift" }, { id: "disconnected", type: "disconnected" }] };
  assert.doesNotThrow(() => new ComponentRegistry().register(custom));
});
test("actuator validation rejects impossible control configuration", () => {
  const invalid = structuredClone(sampleDefinitions.find(v => v.id === "generic.servo")!);
  assert.equal(invalid.kind, "actuator"); if (invalid.kind !== "actuator") return;
  invalid.controls = [{ interfaceId: "absent", quantity: "position", range: { min: 180, max: 0, unit: "deg" }, pwm: { minDutyCycle: .9, maxDutyCycle: .1 } }];
  assert.deepEqual(new Set(validateDefinition(invalid).map(i => i.code)), new Set(["invalid-range", "unknown-interface", "invalid-pwm-range"]));
});
