import type { ComponentInstance, EndpointRef, Project } from "../domain/types.js";
import type { ComponentDefinition } from "../hardware/types.js";

export type DigitalLevel = "LOW" | "HIGH" | "UNKNOWN" | "HIGH_IMPEDANCE";
export type LogicalValue = null | boolean | number | string | readonly number[] | { readonly [key: string]: LogicalValue } | readonly LogicalValue[];
export type SignalValue =
  | { readonly kind: "digital"; readonly level: DigitalLevel }
  | { readonly kind: "analog"; readonly value: number; readonly unit: string }
  | { readonly kind: "pwm"; readonly dutyCycle: number; readonly frequencyHz: number }
  | { readonly kind: "pulse"; readonly frequencyHz: number; readonly level?: "LOW" | "HIGH" }
  | { readonly kind: "data"; readonly value: LogicalValue }
  | { readonly kind: "bytes"; readonly value: readonly number[] };

export type SimulationEventType = "external-input" | "drive-output" | "endpoint-changed" | "behavior-evaluation" | "timer-expired" | "fault-changed" | "custom";
export interface SimulationEvent { readonly id: string; readonly time: number; readonly type: SimulationEventType; readonly target?: string; readonly payload?: unknown; readonly priority: number; readonly order: number; readonly source?: string; readonly metadata?: Readonly<Record<string, unknown>> }
export type DiagnosticSeverity = "info" | "warning" | "error";
export interface SimulationDiagnostic { readonly code: string; readonly severity: DiagnosticSeverity; readonly time: number; readonly message: string; readonly componentId?: string; readonly netId?: string; readonly endpoint?: string }
export interface RuntimeLogEntry { readonly sequence: number; readonly time: number; readonly type: string; readonly message: string; readonly eventId?: string; readonly target?: string; readonly value?: SignalValue }
export interface ComponentRuntimeSnapshot { readonly state: Readonly<Record<string, LogicalValue>>; readonly inputs: Readonly<Record<string, SignalValue>>; readonly outputs: Readonly<Record<string, SignalValue>> }
export interface SimulationSnapshot { readonly simulationTime: number; readonly status: "ready" | "running" | "paused"; readonly componentStates: Readonly<Record<string, ComponentRuntimeSnapshot>>; readonly endpointValues: Readonly<Record<string, SignalValue>>; readonly netValues: Readonly<Record<string, SignalValue>>; readonly pendingEventCount: number; readonly diagnostics: readonly SimulationDiagnostic[] }

export interface BehaviorContext {
  readonly instance: ComponentInstance;
  readonly definition: ComponentDefinition;
  readonly time: number;
  readInput(endpointId: string): SignalValue | undefined;
  readState(key: string): LogicalValue | undefined;
  setState(key: string, value: LogicalValue): void;
  drive(endpointId: string, value: SignalValue, delayMs?: number): void;
  schedule(delayMs: number, type: "timer-expired" | "custom", payload?: unknown): void;
  diagnostic(code: string, message: string, severity?: DiagnosticSeverity): void;
}
export interface ComponentBehavior { initialize?(context: BehaviorContext): void; evaluate?(context: BehaviorContext, changedEndpoint?: string): void; onEvent?(context: BehaviorContext, event: SimulationEvent): void; reset?(context: BehaviorContext): void }
export type BehaviorFactory = (instance: ComponentInstance, definition: ComponentDefinition) => ComponentBehavior;
export interface SimulationOptions { readonly maxEventsPerRun?: number; readonly maxEventsAtSameTime?: number; readonly eventLogRetention?: number; readonly defaultPropagationDelayMs?: number }
export interface RuntimeCreation { readonly project: Project }
export const endpointKey = (endpoint: EndpointRef): string => `${endpoint.instanceId}:${endpoint.endpointKind}:${endpoint.endpointId}`;
