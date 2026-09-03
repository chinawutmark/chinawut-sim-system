/** Versioned, declarative hardware definitions. Values use SI units unless named otherwise. */
export const HARDWARE_SCHEMA_VERSION = "1.0.0" as const;

export type ComponentKind = "board" | "sensor" | "actuator" | "display" | "communication" | "power" | "custom";
export type PinDirection = "input" | "output" | "bidirectional" | "power" | "ground";
export type InterfaceType =
  | "analog-voltage" | "analog-current" | "gpio" | "pulse" | "pwm"
  | "i2c" | "spi" | "uart" | "one-wire" | "rs232" | "rs485"
  | "can" | "modbus-rtu" | "modbus-tcp" | "usb" | "ethernet" | "wireless";

export interface NumericRange { min: number; max: number; unit: string }
export interface RatedValue { value: number; unit: string; typical?: boolean }
export interface DefinitionSource { pluginId?: string; package?: string; uri?: string }
export interface ComponentIdentity {
  id: string;
  schemaVersion: string;
  kind: ComponentKind;
  name: string;
  category: string;
  manufacturer?: string;
  family?: string;
  model?: string;
  description?: string;
  tags?: readonly string[];
  source?: DefinitionSource;
  metadata?: Readonly<Record<string, unknown>>;
}

export type PinCapability =
  | "gpio" | "digital-input" | "digital-output" | "adc" | "dac" | "pwm"
  | "interrupt" | "timer" | "uart" | "i2c" | "spi" | "can" | "usb"
  | "power" | "ground" | "reset" | "boot" | "clock" | "reserved";
export interface PinDefinition {
  id: string;
  name: string;
  aliases?: readonly string[];
  direction: PinDirection;
  capabilities: readonly PinCapability[];
  voltageRange?: NumericRange;
  voltageTolerance?: NumericRange;
  reserved?: boolean;
  specialPurpose?: string;
  restrictions?: readonly string[];
}

export interface DigitalProtocolMetadata {
  i2c?: { addresses?: readonly number[]; addressRange?: readonly [number, number]; configurable?: boolean };
  spi?: { modes?: readonly (0 | 1 | 2 | 3)[]; maxClockHz?: number };
  uart?: { baudRates?: readonly number[]; dataBits?: readonly number[]; parity?: readonly ("none" | "even" | "odd")[] };
  modbus?: { defaultAddress?: number; addressRange?: readonly [number, number]; registerMapRef?: string };
  registerMapRef?: string;
}
export interface InterfaceDefinition {
  id: string;
  type: InterfaceType;
  role: "host" | "device" | "peer" | "transmitter" | "receiver";
  pins: readonly string[];
  instance?: string;
  protocol?: string;
  protocolMetadata?: DigitalProtocolMetadata;
  electrical?: { logicVoltage?: NumericRange; outputVoltage?: NumericRange; outputCurrent?: NumericRange };
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ElectricalDefinition {
  supplyVoltage?: NumericRange;
  recommendedSupplyVoltage?: NumericRange;
  logicVoltage?: NumericRange;
  currentConsumption?: NumericRange;
  operatingVoltage?: NumericRange;
  powerRequirements?: readonly RatedValue[];
  absoluteMaximums?: readonly NumericRange[];
}
export interface MemoryRegion { name: string; kind: "flash" | "ram" | "eeprom" | "rom" | "external"; sizeBytes: number }
export interface ClockDefinition { source: string; frequencyHz: NumericRange; defaultHz?: number }
export interface ProcessorDefinition { manufacturer?: string; model: string; architecture: string; cores?: number; wordSizeBits?: number }

export interface BoardDefinition extends ComponentIdentity {
  kind: "board";
  processor: ProcessorDefinition;
  electrical: ElectricalDefinition;
  pins: readonly PinDefinition[];
  interfaces: readonly InterfaceDefinition[];
  memory?: readonly MemoryRegion[];
  clocks?: readonly ClockDefinition[];
  networking?: readonly ("wifi" | "bluetooth" | "ble" | "ethernet" | "thread" | "zigbee" | "cellular" | "other")[];
  peripheralLimits?: Readonly<Record<string, number>>;
  restrictions?: readonly string[];
}

export interface MeasurementDefinition {
  id: string;
  quantity: string;
  unit: string;
  range: NumericRange;
  resolution?: RatedValue;
  accuracy?: RatedValue;
  sensitivity?: RatedValue;
  sampleRateHz?: NumericRange;
  responseTimeMs?: NumericRange;
  bandwidthHz?: NumericRange;
}
export interface SimulationParameters {
  noise?: RatedValue; drift?: RatedValue; hysteresis?: RatedValue; quantization?: RatedValue;
  clipping?: NumericRange; latencyMs?: NumericRange; updateRateHz?: NumericRange;
  randomVariation?: RatedValue; calibrationOffset?: RatedValue; scaleFactor?: number;
}
export type FaultType =
  | "stuck-value" | "stuck-high" | "stuck-low" | "no-data" | "noisy-signal" | "drift"
  | "out-of-range" | "intermittent" | "communication-timeout" | "corrupted-data"
  | "disconnected" | "power-loss" | "mechanical-jam" | "overload" | "custom";
export interface FaultDefinition { id: string; type: FaultType; description?: string; parameters?: Readonly<Record<string, unknown>> }

export interface SensorDefinition extends ComponentIdentity {
  kind: "sensor";
  pins: readonly PinDefinition[];
  electrical: ElectricalDefinition;
  interfaces: readonly InterfaceDefinition[];
  measurements: readonly MeasurementDefinition[];
  simulation?: SimulationParameters;
  faultModes?: readonly FaultDefinition[];
}

export interface ControlDefinition {
  interfaceId: string;
  quantity: string;
  range?: NumericRange;
  pwm?: { minDutyCycle: number; maxDutyCycle: number; frequencyHz?: NumericRange };
  states?: readonly string[];
}
export interface ActuatorDefinition extends ComponentIdentity {
  kind: "actuator";
  pins: readonly PinDefinition[];
  electrical: ElectricalDefinition;
  interfaces: readonly InterfaceDefinition[];
  controls: readonly ControlDefinition[];
  capabilities?: { speed?: NumericRange; position?: NumericRange; directions?: readonly string[]; responseTimeMs?: NumericRange };
  physicalLimits?: readonly NumericRange[];
  faultModes?: readonly FaultDefinition[];
}

export interface DisplayDefinition extends ComponentIdentity {
  kind: "display"; pins: readonly PinDefinition[]; electrical: ElectricalDefinition; interfaces: readonly InterfaceDefinition[];
  display: { technology: "led" | "seven-segment" | "lcd" | "oled" | "tft" | "touch" | "hmi" | "generic"; width?: number; height?: number; colorDepthBits?: number; touch?: boolean };
  initialState?: Readonly<Record<string, unknown>>;
}
export interface CommunicationDefinition extends ComponentIdentity {
  kind: "communication"; pins: readonly PinDefinition[]; electrical: ElectricalDefinition; interfaces: readonly InterfaceDefinition[];
  capabilities: readonly ("wifi" | "ble" | "ethernet" | "lora" | "rf" | "gnss" | "can-transceiver" | "rs485-transceiver" | "usb-uart")[];
}
export interface PowerDefinition extends ComponentIdentity {
  kind: "power"; pins: readonly PinDefinition[]; electrical: ElectricalDefinition; interfaces?: readonly InterfaceDefinition[];
  powerType: "battery" | "dc-supply" | "voltage-regulator" | "buck" | "boost" | "rail" | "fuse" | "circuit-breaker" | "ground";
  input?: NumericRange; output?: NumericRange; capacity?: RatedValue; efficiency?: NumericRange;
}

/** Foundation used by catalog and user-authored components alike. */
export interface CustomComponentDefinition extends ComponentIdentity {
  kind: "custom"; pins: readonly PinDefinition[]; electrical: ElectricalDefinition; interfaces: readonly InterfaceDefinition[];
  inputs?: readonly MeasurementDefinition[]; outputs?: readonly MeasurementDefinition[]; measurements?: readonly MeasurementDefinition[];
  simulation?: SimulationParameters; faultModes?: readonly FaultDefinition[];
}

export type ComponentDefinition = BoardDefinition | SensorDefinition | ActuatorDefinition | DisplayDefinition | CommunicationDefinition | PowerDefinition | CustomComponentDefinition;
