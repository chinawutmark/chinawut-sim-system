import type { InterfaceType, PinCapability } from "../hardware/types.js";

export const PROJECT_SCHEMA_VERSION = "1.0.0" as const;
export type Id = string;
export interface Position { x: number; y: number }

/** Active project-level use of a hardware pin. More specific than catalog PinCapability. */
export type EndpointFunction =
  | "digital-input" | "digital-output" | "analog-input" | "analog-output" | "pwm" | "interrupt" | "pulse"
  | "uart-tx" | "uart-rx" | "i2c-sda" | "i2c-scl"
  | "spi-mosi" | "spi-miso" | "spi-clock" | "spi-cs"
  | "can-high" | "can-low" | "rs485-a" | "rs485-b"
  | "power" | "ground" | `custom:${string}`;

export interface PinAssignment {
  id: Id;
  signal: string;
  pinId: Id;
  function: EndpointFunction;
  interfaceId?: Id;
  peripheral?: string;
}

export interface ComponentInstance {
  id: Id;
  definitionId: Id;
  name: string;
  description?: string;
  position: Position;
  rotation?: number;
  enabled: boolean;
  configuration?: Record<string, unknown>;
  parameterOverrides?: Record<string, unknown>;
  interfaceConfiguration?: Record<string, unknown>;
  pinAssignments: PinAssignment[];
  pinAliases?: Record<Id, string>;
  /** Placeholder only; persisted project configuration must not contain live runtime values. */
  runtimeStateRef?: Id;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export type ConnectionDomain = "physical" | "electrical" | "bus" | "network" | "logical";
export type ConnectionType =
  | "digital" | "analog" | "pwm" | "interrupt" | "pulse"
  | "uart" | "i2c" | "spi" | "one-wire" | "can" | "rs232" | "rs485"
  | "modbus-rtu" | "modbus-tcp"
  | "ethernet" | "wifi" | "bluetooth" | "ble" | "esp-now" | "mqtt" | "http"
  | "websocket" | "tcp" | "udp"
  | "dc-power" | "regulated-power" | "ground" | `custom:${string}`;

export type EndpointKind = "pin" | "interface";
/** Stable project reference to a catalog pin or interface. Catalog facts are never duplicated here. */
export interface EndpointRef {
  instanceId: Id;
  endpointKind: EndpointKind;
  endpointId: Id;
  function?: EndpointFunction;
  role?: string;
  channel?: string;
  configuration?: Record<string, unknown>;
}

export interface I2cConfiguration { speedHz?: number; addresses?: Record<Id, number> }
export interface UartConfiguration { baudRate?: number; dataBits?: number; parity?: "none" | "even" | "odd"; stopBits?: number }
export interface SpiConfiguration { mode?: 0 | 1 | 2 | 3; frequencyHz?: number; chipSelects?: Record<Id, Id> }
export interface CanConfiguration { bitrate?: number }
export interface Rs485Configuration { baudRate?: number; addresses?: Record<Id, number> }
export interface NetworkConfiguration { networkId?: string; channel?: string; protocol?: string; properties?: Record<string, unknown> }
export type NetConfiguration = I2cConfiguration | UartConfiguration | SpiConfiguration | CanConfiguration | Rs485Configuration | NetworkConfiguration | Record<string, unknown>;

export interface Net {
  id: Id;
  projectId: Id;
  name: string;
  domain: ConnectionDomain;
  type: ConnectionType;
  endpoints: EndpointRef[];
  enabled: boolean;
  configuration?: NetConfiguration;
  metadata?: Record<string, unknown>;
}

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: Id;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  instances: ComponentInstance[];
  nets: Net[];
  aliases?: Record<string, string>;
  simulationSettings?: Record<string, unknown>;
  faultConfigurations?: Record<string, unknown>[];
  runtimeStateRefs?: Id[];
  metadata?: Record<string, unknown>;
}

export type ValidationSeverity = "error" | "warning";
export interface ValidationIssue { code: string; severity: ValidationSeverity; message: string; path?: string }

export interface FunctionRequirement { pinCapability?: PinCapability; interfaceType?: InterfaceType }
