import type { ComponentDefinition, InterfaceType, PinCapability, PinDefinition } from "../hardware/types.js";
import type { ComponentRegistry } from "../hardware/registry.js";
import { resolveEndpoint } from "./resolve.js";
import { PROJECT_SCHEMA_VERSION, type ComponentInstance, type EndpointFunction, type Net, type Project, type ValidationIssue } from "./types.js";

const issue = (code: string, severity: "error" | "warning", message: string, path?: string): ValidationIssue =>
  path === undefined ? { code, severity, message } : { code, severity, message, path };

const functionRequirements: Partial<Record<EndpointFunction, { pin?: PinCapability; iface?: InterfaceType }>> = {
  "digital-input": { pin: "digital-input" },
  "digital-output": { pin: "digital-output" },
  "analog-input": { pin: "adc" },
  "analog-output": { pin: "dac" },
  pwm: { pin: "pwm" },
  interrupt: { pin: "interrupt" },
  pulse: { pin: "gpio" },
  "uart-tx": { pin: "uart", iface: "uart" },
  "uart-rx": { pin: "uart", iface: "uart" },
  "i2c-sda": { pin: "i2c", iface: "i2c" },
  "i2c-scl": { pin: "i2c", iface: "i2c" },
  "spi-mosi": { pin: "spi", iface: "spi" },
  "spi-miso": { pin: "spi", iface: "spi" },
  "spi-clock": { pin: "spi", iface: "spi" },
  "spi-cs": { pin: "spi", iface: "spi" },
  "can-high": { pin: "can", iface: "can" },
  "can-low": { pin: "can", iface: "can" },
  power: { pin: "power" },
  ground: { pin: "ground" },
};

const netFunctions: Partial<Record<Net["type"], readonly EndpointFunction[]>> = {
  digital: ["digital-input", "digital-output"],
  analog: ["analog-input", "analog-output"],
  pwm: ["pwm"],
  interrupt: ["interrupt"],
  pulse: ["pulse"],
  uart: ["uart-tx", "uart-rx"],
  i2c: ["i2c-sda", "i2c-scl"],
  spi: ["spi-mosi", "spi-miso", "spi-clock", "spi-cs"],
  can: ["can-high", "can-low"],
  rs485: ["rs485-a", "rs485-b"],
  "dc-power": ["power"],
  "regulated-power": ["power"],
  ground: ["ground"],
};

export function validateProject(project: Project, registry: ComponentRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) issues.push(issue("UNSUPPORTED_SCHEMA", "error", `Unsupported schema version: ${String(project.schemaVersion)}`));

  const instanceIds = new Set<string>();
  const netIds = new Set<string>();
  for (const instance of project.instances) {
    if (instanceIds.has(instance.id)) issues.push(issue("DUPLICATE_INSTANCE_ID", "error", `Duplicate instance ${instance.id}`));
    instanceIds.add(instance.id);
    const definition = registry.get(instance.definitionId);
    if (!definition) {
      issues.push(issue("MISSING_DEFINITION", "error", `Missing Component Definition: ${instance.definitionId}`, `instances.${instance.id}`));
      continue;
    }
    validateAssignments(instance, definition, issues);
  }

  for (const net of project.nets) {
    if (netIds.has(net.id)) issues.push(issue("DUPLICATE_NET_ID", "error", `Duplicate net ${net.id}`));
    netIds.add(net.id);
    if (net.projectId !== project.id) issues.push(issue("NET_PROJECT_MISMATCH", "error", `Net ${net.id} belongs to ${net.projectId}, expected ${project.id}`));
    if (net.enabled) validateNet(project, net, registry, issues);
  }

  validateSupplies(project, registry, issues);
  validateCommonGround(project, registry, issues);
  return issues;
}

function validateAssignments(instance: ComponentInstance, definition: ComponentDefinition, issues: ValidationIssue[]): void {
  const byPin = new Map<string, typeof instance.pinAssignments>();
  for (const assignment of instance.pinAssignments) {
    const pin = definition.pins.find((item) => item.id === assignment.pinId);
    if (!pin || pin.reserved || pin.capabilities.includes("reserved") || !supportsFunction(definition, pin, assignment.function, assignment.interfaceId)) {
      issues.push(issue("PIN_CAPABILITY_CONFLICT", "error", `${assignment.signal} cannot use ${assignment.pinId} as ${assignment.function}`));
    }
    const assignments = byPin.get(assignment.pinId) ?? [];
    assignments.push(assignment);
    byPin.set(assignment.pinId, assignments);
  }
  for (const [pinId, assignments] of byPin) {
    if (new Set(assignments.map((item) => item.function)).size > 1) {
      issues.push(issue("DUPLICATE_PIN_ASSIGNMENT", "error", `${instance.name} pin ${pinId} has incompatible active assignments`));
    }
  }
}

function supportsFunction(definition: ComponentDefinition, pin: PinDefinition, fn: EndpointFunction, interfaceId?: string): boolean {
  const req = functionRequirements[fn];
  if (req?.pin && !pin.capabilities.includes(req.pin)) return false;
  if (req?.iface) {
    const candidates = (definition.interfaces ?? []).filter((iface) => iface.type === req.iface && iface.pins.includes(pin.id));
    if (interfaceId && !candidates.some((iface) => iface.id === interfaceId)) return false;
    if (!candidates.length && req.pin && !pin.capabilities.includes(req.pin)) return false;
  }
  return true;
}

function validateNet(project: Project, net: Net, registry: ComponentRegistry, issues: ValidationIssue[]): void {
  if (!net.endpoints.length) issues.push(issue("EMPTY_NET", "error", `${net.name} has no endpoints`));
  const resolved = net.endpoints.map((ref) => resolveEndpoint(project, registry, ref));
  net.endpoints.forEach((ref, index) => {
    if (!resolved[index]) issues.push(issue("INVALID_ENDPOINT", "error", `Cannot resolve ${ref.instanceId}:${ref.endpointKind}:${ref.endpointId}`));
  });
  const endpoints = resolved.flatMap((item) => item ? [item] : []);

  const allowedFunctions = netFunctions[net.type];
  if (allowedFunctions) {
    net.endpoints.forEach((ref, index) => {
      if (ref.function && !allowedFunctions.includes(ref.function)) {
        issues.push(issue("INTERFACE_MISMATCH", "error", `${ref.instanceId}:${ref.endpointId} function ${ref.function} is incompatible with ${net.type}`));
      }
      const item = resolved[index];
      if (item?.kind === "pin" && ref.function && !supportsFunction(item.definition, item.pin, ref.function)) {
        issues.push(issue("INTERFACE_MISMATCH", "error", `${item.instance.name}:${item.pin.name} cannot serve as ${ref.function}`));
      }
    });
  }

  const outputs = endpoints.filter((item) => item.kind === "pin" && item.pin.direction === "output");
  if (!["ground", "i2c", "can", "rs485", "dc-power", "regulated-power"].includes(net.type) && outputs.length > 1) {
    issues.push(issue("DIRECTION_CONFLICT", "error", `${net.name} connects multiple outputs`));
  }

  const maxOutput = Math.max(...outputs.map((item) => item.kind === "pin" ? (item.pin.voltageRange?.max ?? -Infinity) : -Infinity));
  for (const item of endpoints) {
    if (item.kind !== "pin" || (item.pin.direction !== "input" && item.pin.direction !== "bidirectional")) continue;
    const maxInput = item.pin.voltageTolerance?.max ?? item.pin.voltageRange?.max;
    if (maxInput !== undefined && Number.isFinite(maxOutput) && maxOutput > maxInput) {
      issues.push(issue("VOLTAGE_INCOMPATIBLE", "error", `${maxOutput}V exceeds ${item.instance.name} ${maxInput}V maximum`));
    }
  }

  if (net.type === "i2c") {
    const addresses = (net.configuration as { addresses?: Record<string, number> } | undefined)?.addresses ?? {};
    const seen = new Map<number, string>();
    for (const [id, address] of Object.entries(addresses)) {
      if (!Number.isInteger(address) || address < 0 || address > 0x7f) issues.push(issue("INVALID_I2C_ADDRESS", "error", `Invalid 7-bit I2C address for ${id}`));
      if (seen.has(address)) issues.push(issue("DUPLICATE_I2C_ADDRESS", "error", `I2C address 0x${address.toString(16)} used by ${seen.get(address)} and ${id}`));
      seen.set(address, id);
    }
  }

  if (net.type === "uart") {
    const functions = net.endpoints.map((ref) => ref.function);
    if (!functions.includes("uart-tx") || !functions.includes("uart-rx")) issues.push(issue("UART_PAIR_MISSING", "error", `${net.name} requires TX and RX`));
    const configs = net.endpoints.map((ref) => JSON.stringify(ref.configuration?.uart ?? null)).filter((value) => value !== "null");
    if (new Set(configs).size > 1) issues.push(issue("UART_CONFIG_MISMATCH", "error", `${net.name} has mismatched UART configurations`));
  }
}

function validateSupplies(project: Project, registry: ComponentRegistry, issues: ValidationIssue[]): void {
  for (const instance of project.instances.filter((item) => item.enabled)) {
    const definition = registry.get(instance.definitionId);
    if (!definition) continue;
    const rating = definition.electrical.supplyVoltage;
    const powerPins = definition.pins.filter((pin) => pin.direction === "power" || pin.capabilities.includes("power"));
    if (!rating || !powerPins.length) continue;

    const connected = project.nets.filter((net) => net.enabled && ["dc-power", "regulated-power"].includes(net.type)
      && net.endpoints.some((ref) => ref.instanceId === instance.id && ref.endpointKind === "pin" && powerPins.some((pin) => pin.id === ref.endpointId)));
    if (!connected.length) {
      issues.push(issue("MISSING_REQUIRED_POWER", "error", `${instance.name} is missing a required supply`));
      continue;
    }
    for (const net of connected) {
      const voltage = Number(net.metadata?.voltage);
      if (Number.isFinite(voltage) && (voltage < rating.min || voltage > rating.max)) {
        issues.push(issue("SUPPLY_VOLTAGE_OUT_OF_RANGE", "error", `${voltage}V is outside ${instance.name} supply rating ${rating.min}-${rating.max}${rating.unit}`));
      }
    }
  }
}

function validateCommonGround(project: Project, registry: ComponentRegistry, issues: ValidationIssue[]): void {
  const groundNets = project.nets.filter((net) => net.enabled && net.type === "ground");
  for (const net of project.nets.filter((item) => item.enabled && ["physical", "bus", "electrical"].includes(item.domain)
    && !["ground", "dc-power", "regulated-power"].includes(item.type))) {
    const instanceIds = [...new Set(net.endpoints.map((ref) => ref.instanceId))];
    if (instanceIds.length < 2) continue;
    const requiresGround = instanceIds.filter((id) => {
      const instance = project.instances.find((item) => item.id === id);
      const definition = instance ? registry.get(instance.definitionId) : undefined;
      return Boolean(definition?.pins.some((pin) => pin.direction === "ground" || pin.capabilities.includes("ground")));
    });
    if (requiresGround.length < 2) continue;
    const shared = groundNets.some((ground) => requiresGround.every((id) => ground.endpoints.some((ref) => ref.instanceId === id)));
    if (!shared) issues.push(issue("MISSING_COMMON_GROUND", "warning", `${net.name} connects devices without a shared ground`));
  }
}
