import { HARDWARE_SCHEMA_VERSION, type ComponentDefinition, type InterfaceDefinition, type NumericRange, type PinDefinition } from "./types.js";

export interface ValidationIssue { path: string; code: string; message: string }
export class DefinitionValidationError extends Error {
  constructor(public readonly issues: readonly ValidationIssue[]) { super(issues.map(i => `${i.path}: ${i.message}`).join("; ")); this.name = "DefinitionValidationError"; }
}
const issue = (path: string, code: string, message: string): ValidationIssue => ({ path, code, message });
function range(value: NumericRange | undefined, path: string, issues: ValidationIssue[]): void {
  if (!value) return;
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min > value.max) issues.push(issue(path, "invalid-range", "minimum must be finite and no greater than maximum"));
  if (!value.unit.trim()) issues.push(issue(`${path}.unit`, "missing-unit", "unit is required"));
}
function pins(values: readonly PinDefinition[], issues: ValidationIssue[]): Set<string> {
  const names = new Set<string>();
  values.forEach((pin, index) => {
    const primary = [pin.id.toLowerCase(), pin.name.toLowerCase()];
    const all = [primary[0]!, ...(primary[1] === primary[0] ? [] : [primary[1]!]), ...(pin.aliases ?? []).map(v => v.toLowerCase())];
    const withinPin = new Set<string>();
    all.forEach(name => { if (names.has(name) || withinPin.has(name)) issues.push(issue(`pins[${index}]`, "duplicate-pin", `pin name or alias '${name}' is duplicated`)); withinPin.add(name); names.add(name); });
    range(pin.voltageRange, `pins[${index}].voltageRange`, issues); range(pin.voltageTolerance, `pins[${index}].voltageTolerance`, issues);
  });
  return new Set(values.map(p => p.id));
}
function interfaces(values: readonly InterfaceDefinition[], pinIds: Set<string>, issues: ValidationIssue[]): void {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    if (ids.has(item.id)) issues.push(issue(`interfaces[${index}].id`, "duplicate-interface", "interface ID is duplicated")); ids.add(item.id);
    if (!item.pins.length) issues.push(issue(`interfaces[${index}].pins`, "missing-pins", "interface must reference at least one pin"));
    item.pins.forEach(pin => { if (!pinIds.has(pin)) issues.push(issue(`interfaces[${index}].pins`, "unknown-pin", `unknown pin '${pin}'`)); });
    const i2c = item.protocolMetadata?.i2c;
    i2c?.addresses?.forEach(address => { if (!Number.isInteger(address) || address < 0 || address > 0x7f) issues.push(issue(`interfaces[${index}].protocolMetadata.i2c`, "invalid-address", "I2C addresses must be 7-bit integers")); });
    item.protocolMetadata?.spi?.modes?.forEach(mode => { if (![0, 1, 2, 3].includes(mode)) issues.push(issue(`interfaces[${index}].protocolMetadata.spi`, "invalid-spi-mode", "SPI mode must be 0 through 3")); });
  });
}

export function validateDefinition(definition: ComponentDefinition): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(definition.id)) issues.push(issue("id", "invalid-id", "use a stable, namespaced lowercase ID"));
  if (definition.schemaVersion !== HARDWARE_SCHEMA_VERSION) issues.push(issue("schemaVersion", "unsupported-schema", `expected ${HARDWARE_SCHEMA_VERSION}`));
  if (!definition.name.trim() || !definition.category.trim()) issues.push(issue("identity", "missing-identity", "name and category are required"));
  const pinIds = pins(definition.pins, issues);
  interfaces(definition.interfaces ?? [], pinIds, issues);
  const electrical = definition.electrical;
  range(electrical.supplyVoltage, "electrical.supplyVoltage", issues); range(electrical.recommendedSupplyVoltage, "electrical.recommendedSupplyVoltage", issues);
  range(electrical.logicVoltage, "electrical.logicVoltage", issues); range(electrical.currentConsumption, "electrical.currentConsumption", issues); range(electrical.operatingVoltage, "electrical.operatingVoltage", issues);
  if (definition.kind === "sensor") definition.measurements.forEach((m, i) => { range(m.range, `measurements[${i}].range`, issues); if (m.unit !== m.range.unit) issues.push(issue(`measurements[${i}].unit`, "unit-mismatch", "measurement and range units must match")); range(m.sampleRateHz, `measurements[${i}].sampleRateHz`, issues); });
  if (definition.kind === "actuator") definition.controls.forEach((control, i) => { range(control.range, `controls[${i}].range`, issues); if (!definition.interfaces.some(v => v.id === control.interfaceId)) issues.push(issue(`controls[${i}].interfaceId`, "unknown-interface", "control references an unknown interface")); if (control.pwm && (control.pwm.minDutyCycle < 0 || control.pwm.maxDutyCycle > 1 || control.pwm.minDutyCycle > control.pwm.maxDutyCycle)) issues.push(issue(`controls[${i}].pwm`, "invalid-pwm-range", "PWM duty cycle must be ordered within 0..1")); });
  return issues;
}
export function assertValidDefinition(definition: ComponentDefinition): void { const issues = validateDefinition(definition); if (issues.length) throw new DefinitionValidationError(issues); }
