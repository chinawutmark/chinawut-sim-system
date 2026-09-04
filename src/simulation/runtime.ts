import type { EndpointRef, Project } from "../domain/types.js";
import type { ComponentRegistry } from "../hardware/registry.js";
import { BehaviorRegistry } from "./behaviors.js";
import { DeterministicScheduler } from "./scheduler.js";
import { isSignalValue, signalEquals } from "./signals.js";
import {
  endpointKey,
  type BehaviorContext,
  type ComponentBehavior,
  type ComponentRuntimeSnapshot,
  type DiagnosticSeverity,
  type LogicalValue,
  type RuntimeLogEntry,
  type SignalValue,
  type SimulationDiagnostic,
  type SimulationEvent,
  type SimulationOptions,
  type SimulationSnapshot,
} from "./types.js";

interface MutableComponent {
  state: Record<string, LogicalValue>;
  inputs: Map<string, SignalValue>;
  outputs: Map<string, SignalValue>;
  behavior?: ComponentBehavior;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Headless, synchronous discrete-event runtime. Project/catalog objects are read, never mutated. */
export class SimulationRuntime {
  readonly #project: Project;
  readonly #registry: ComponentRegistry;
  readonly #behaviors: BehaviorRegistry;
  readonly #options: Required<SimulationOptions>;

  #scheduler = new DeterministicScheduler();
  #components = new Map<string, MutableComponent>();
  #endpointValues = new Map<string, SignalValue>();
  #netValues = new Map<string, SignalValue>();
  #endpointNets = new Map<string, string[]>();
  #netDrivers = new Map<string, Map<string, SignalValue>>();
  #diagnostics: SimulationDiagnostic[] = [];
  #log: RuntimeLogEntry[] = [];
  #logSequence = 0;
  #time = 0;
  #status: "ready" | "running" | "paused" = "ready";
  #initialized = false;

  constructor(project: Project, registry: ComponentRegistry, behaviors: BehaviorRegistry, options: SimulationOptions = {}) {
    this.#project = project;
    this.#registry = registry;
    this.#behaviors = behaviors;
    this.#options = {
      maxEventsPerRun: options.maxEventsPerRun ?? 100_000,
      maxEventsAtSameTime: options.maxEventsAtSameTime ?? 10_000,
      eventLogRetention: options.eventLogRetention ?? 10_000,
      defaultPropagationDelayMs: options.defaultPropagationDelayMs ?? 0,
    };
    this.#validateOptions();
  }

  get time(): number { return this.#time; }

  initialize(): void {
    if (this.#initialized) return;
    this.#build();
    this.#initialized = true;
    this.#record("SIMULATION_STARTED", "Simulation initialized");
    for (const instance of this.#project.instances.filter((item) => item.enabled).sort((a, b) => a.id.localeCompare(b.id))) {
      this.#invoke(instance.id, "initialize");
    }
  }

  reset(): void {
    this.#scheduler.clear();
    this.#components.clear();
    this.#endpointValues.clear();
    this.#netValues.clear();
    this.#endpointNets.clear();
    this.#netDrivers.clear();
    this.#diagnostics = [];
    this.#log = [];
    this.#logSequence = 0;
    this.#time = 0;
    this.#status = "ready";
    this.#initialized = false;
    this.initialize();
  }

  pause(): void {
    this.#status = "paused";
    this.#record("SIMULATION_PAUSED", "Simulation paused");
  }

  resume(): void {
    this.#status = "ready";
    this.#record("SIMULATION_RESUMED", "Simulation resumed");
  }

  setInput(instanceId: string, value: SignalValue, atTime = this.#time): string {
    return this.scheduleInput(instanceId, value, atTime);
  }

  scheduleInput(instanceId: string, value: SignalValue, atTime: number): string {
    this.#ensure();
    this.#assertSchedulableTime(atTime);
    const event = this.#scheduler.schedule({
      time: atTime,
      type: "external-input",
      target: instanceId,
      payload: clone(value),
      priority: 10,
      source: "external",
    });
    return event.id;
  }

  scheduleEvent(time: number, type: SimulationEvent["type"], target?: string, payload?: unknown, priority = 100): string {
    this.#ensure();
    this.#assertSchedulableTime(time);
    return this.#scheduler.schedule({
      time,
      type,
      priority,
      ...(target ? { target } : {}),
      ...(payload === undefined ? {} : { payload }),
    }).id;
  }

  step(): boolean {
    this.#ensure();
    if (this.#status === "paused") return false;
    const event = this.#scheduler.pop();
    if (!event) return false;
    if (event.time < this.#time) {
      this.#diag("NON_MONOTONIC_EVENT", `Discarded event '${event.id}' scheduled before current simulation time`, "error");
      return true;
    }
    this.#status = "running";
    this.#time = event.time;
    this.#process(event);
    this.#status = "ready";
    return true;
  }

  stepOnce(): boolean { return this.step(); }

  runUntil(until: number): void {
    this.#ensure();
    if (!Number.isFinite(until) || until < this.#time) throw new RangeError("Simulation time must be finite and cannot move backwards");
    if (this.#status === "paused") return;

    let count = 0;
    let sameTimeCount = 0;
    let lastTime = -1;
    while (this.#scheduler.peek() && this.#scheduler.peek()!.time <= until) {
      const next = this.#scheduler.peek()!;
      sameTimeCount = next.time === lastTime ? sameTimeCount + 1 : 1;
      lastTime = next.time;
      if (++count > this.#options.maxEventsPerRun) {
        this.#diag("SIMULATION_EVENT_LIMIT", "Event limit reached", "error");
        break;
      }
      if (sameTimeCount > this.#options.maxEventsAtSameTime) {
        this.#diag("SIMULATION_OSCILLATION", "Same-time propagation did not settle", "error");
        this.#discardTime(next.time);
        break;
      }
      this.step();
    }
    this.#time = until;
  }

  getComponentState(id: string): ComponentRuntimeSnapshot | undefined {
    const component = this.#components.get(id);
    return component ? {
      state: clone(component.state),
      inputs: Object.fromEntries([...component.inputs].map(([key, value]) => [key, clone(value)])),
      outputs: Object.fromEntries([...component.outputs].map(([key, value]) => [key, clone(value)])),
    } : undefined;
  }

  getEndpointValue(ref: EndpointRef | string): SignalValue | undefined {
    const value = this.#endpointValues.get(typeof ref === "string" ? ref : endpointKey(ref));
    return value && clone(value);
  }

  getNetValue(id: string): SignalValue | undefined {
    const value = this.#netValues.get(id);
    return value && clone(value);
  }

  getDiagnostics(): readonly SimulationDiagnostic[] { return clone(this.#diagnostics); }
  getEventLog(): readonly RuntimeLogEntry[] { return clone(this.#log); }

  getSnapshot(): SimulationSnapshot {
    const states: Record<string, ComponentRuntimeSnapshot> = {};
    for (const id of [...this.#components.keys()].sort()) states[id] = this.getComponentState(id)!;
    return {
      simulationTime: this.#time,
      status: this.#status,
      componentStates: states,
      endpointValues: Object.fromEntries([...this.#endpointValues].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, clone(value)])),
      netValues: Object.fromEntries([...this.#netValues].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, clone(value)])),
      pendingEventCount: this.#scheduler.size,
      diagnostics: this.getDiagnostics(),
    };
  }

  #ensure(): void {
    if (!this.#initialized) this.initialize();
  }

  #validateOptions(): void {
    if (!Number.isInteger(this.#options.maxEventsPerRun) || this.#options.maxEventsPerRun <= 0) throw new RangeError("maxEventsPerRun must be a positive integer");
    if (!Number.isInteger(this.#options.maxEventsAtSameTime) || this.#options.maxEventsAtSameTime <= 0) throw new RangeError("maxEventsAtSameTime must be a positive integer");
    if (!Number.isInteger(this.#options.eventLogRetention) || this.#options.eventLogRetention < 0) throw new RangeError("eventLogRetention must be a non-negative integer");
    if (!Number.isFinite(this.#options.defaultPropagationDelayMs) || this.#options.defaultPropagationDelayMs < 0) throw new RangeError("defaultPropagationDelayMs must be a non-negative finite number");
  }

  #assertSchedulableTime(time: number): void {
    if (!Number.isFinite(time) || time < this.#time) throw new RangeError("Event time must be finite and cannot be earlier than current simulation time");
  }

  #assertDelay(delay: number): void {
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Simulation delay must be a non-negative finite number");
  }

  #build(): void {
    for (const net of this.#project.nets.filter((item) => item.enabled).sort((a, b) => a.id.localeCompare(b.id))) {
      for (const endpoint of net.endpoints) {
        const key = endpointKey(endpoint);
        const list = this.#endpointNets.get(key) ?? [];
        list.push(net.id);
        this.#endpointNets.set(key, list);
      }
    }

    for (const instance of this.#project.instances.filter((item) => item.enabled).sort((a, b) => a.id.localeCompare(b.id))) {
      const definition = this.#registry.get(instance.definitionId);
      const runtime: MutableComponent = { state: {}, inputs: new Map(), outputs: new Map() };
      this.#components.set(instance.id, runtime);
      if (!definition) {
        this.#diag("MISSING_DEFINITION", `Definition '${instance.definitionId}' is unavailable`, "error", instance.id);
        continue;
      }
      const behaviorId = typeof instance.configuration?.behaviorId === "string" ? instance.configuration.behaviorId : instance.definitionId;
      const factory = this.#behaviors.get(behaviorId);
      if (!factory) {
        this.#diag("UNRESOLVED_BEHAVIOR", `No behavior registered as '${behaviorId}'`, "warning", instance.id);
        continue;
      }
      try {
        runtime.behavior = factory(instance, definition);
      } catch (error) {
        this.#behaviorError(instance.id, error);
      }
    }
  }

  #process(event: SimulationEvent): void {
    this.#record(event.type, `${event.type}${event.target ? ` for ${event.target}` : ""}`, event);
    if (event.type === "drive-output") {
      this.#driveNow(event.target!, event.payload);
      return;
    }
    if (event.type === "endpoint-changed") {
      const [instanceId, , endpointId] = event.target!.split(":");
      const component = this.#components.get(instanceId!);
      if (component && isSignalValue(event.payload)) {
        component.inputs.set(endpointId!, clone(event.payload));
        this.#invoke(instanceId!, "evaluate", endpointId);
      }
      return;
    }
    if (event.target) this.#invoke(event.target, "event", undefined, event);
  }

  #driveNow(target: string, payload: unknown): void {
    if (!isSignalValue(payload)) {
      this.#diag("INVALID_RUNTIME_SIGNAL", `Invalid signal driven at '${target}'`, "error", target.split(":")[0], undefined, target);
      return;
    }

    const [instanceId, , endpointId] = target.split(":");
    const component = this.#components.get(instanceId!);
    if (!component) return;
    if (signalEquals(component.outputs.get(endpointId!), payload)) return;

    component.outputs.set(endpointId!, clone(payload));
    this.#endpointValues.set(target, clone(payload));
    this.#record("OUTPUT_CHANGED", `${target} changed`, undefined, target, payload);

    for (const netId of this.#endpointNets.get(target) ?? []) {
      const net = this.#project.nets.find((item) => item.id === netId)!;
      const drivers = this.#netDrivers.get(netId) ?? new Map<string, SignalValue>();
      drivers.set(target, clone(payload));
      this.#netDrivers.set(netId, drivers);
      const values = [...drivers.values()];
      if (values.some((value) => !signalEquals(value, values[0]))) {
        this.#diag("DRIVER_CONFLICT", `Net '${netId}' has conflicting drivers`, "error", instanceId, netId, target);
        continue;
      }
      if (signalEquals(this.#netValues.get(netId), payload)) continue;

      this.#netValues.set(netId, clone(payload));
      this.#record("NET_CHANGED", `${netId} changed`, undefined, netId, payload);
      const configured = (net.configuration as Record<string, unknown> | undefined)?.propagationDelayMs;
      let delay = configured === undefined ? this.#options.defaultPropagationDelayMs : Number(configured);
      if (!Number.isFinite(delay) || delay < 0) {
        this.#diag("INVALID_PROPAGATION_DELAY", `Net '${netId}' has an invalid propagation delay; using the default`, "error", instanceId, netId);
        delay = this.#options.defaultPropagationDelayMs;
      }

      for (const endpoint of net.endpoints) {
        const key = endpointKey(endpoint);
        if (key === target) continue;
        if (signalEquals(this.#endpointValues.get(key), payload)) continue;
        this.#endpointValues.set(key, clone(payload));
        this.#scheduler.schedule({
          time: this.#time + delay,
          type: "endpoint-changed",
          target: key,
          payload: clone(payload),
          priority: 30,
          source: netId,
        });
      }
    }
  }

  #invoke(instanceId: string, kind: "initialize" | "evaluate" | "event", endpoint?: string, event?: SimulationEvent): void {
    const instance = this.#project.instances.find((item) => item.id === instanceId);
    const definition = instance && this.#registry.get(instance.definitionId);
    const runtime = this.#components.get(instanceId);
    if (!instance || !definition || !runtime?.behavior) return;
    const context = this.#context(instanceId);
    try {
      if (kind === "initialize") runtime.behavior.initialize?.(context);
      else if (kind === "evaluate") runtime.behavior.evaluate?.(context, endpoint);
      else if (event) runtime.behavior.onEvent?.(context, event);
    } catch (error) {
      this.#behaviorError(instanceId, error);
    }
  }

  #context(instanceId: string): BehaviorContext {
    const instance = this.#project.instances.find((item) => item.id === instanceId)!;
    const definition = this.#registry.require(instance.definitionId);
    const runtime = this.#components.get(instanceId)!;
    return {
      instance,
      definition,
      time: this.#time,
      readInput: (id) => {
        const value = runtime.inputs.get(id);
        return value && clone(value);
      },
      readState: (key) => clone(runtime.state[key]),
      setState: (key, value) => {
        if (JSON.stringify(runtime.state[key]) === JSON.stringify(value)) return;
        runtime.state[key] = clone(value);
        this.#record("COMPONENT_STATE_CHANGED", `${instanceId}.${key} changed`, undefined, instanceId);
      },
      drive: (id, value, delay = 0) => {
        this.#assertDelay(delay);
        this.#scheduler.schedule({
          time: this.#time + delay,
          type: "drive-output",
          target: `${instanceId}:pin:${id}`,
          payload: clone(value),
          priority: 20,
          source: instanceId,
        });
      },
      schedule: (delay, type, payload) => {
        this.#assertDelay(delay);
        this.#scheduler.schedule({
          time: this.#time + delay,
          type,
          target: instanceId,
          ...(payload === undefined ? {} : { payload }),
          priority: 40,
          source: instanceId,
        });
      },
      diagnostic: (code, message, severity = "warning") => this.#diag(code, message, severity, instanceId),
    };
  }

  #diag(code: string, message: string, severity: DiagnosticSeverity, componentId?: string, netId?: string, endpoint?: string): void {
    this.#diagnostics.push({
      code,
      message,
      severity,
      time: this.#time,
      ...(componentId ? { componentId } : {}),
      ...(netId ? { netId } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
    this.#record("DIAGNOSTIC", `${code}: ${message}`);
  }

  #behaviorError(id: string, error: unknown): void {
    this.#diag("BEHAVIOR_EXCEPTION", `Behavior failed: ${error instanceof Error ? error.message : String(error)}`, "error", id);
  }

  #record(type: string, message: string, event?: SimulationEvent, target?: string, value?: SignalValue): void {
    this.#log.push({
      sequence: this.#logSequence++,
      time: this.#time,
      type,
      message,
      ...(event ? { eventId: event.id, target: event.target } : {}),
      ...(target ? { target } : {}),
      ...(value ? { value: clone(value) } : {}),
    });
    if (this.#log.length > this.#options.eventLogRetention) {
      this.#log.splice(0, this.#log.length - this.#options.eventLogRetention);
    }
  }

  #discardTime(time: number): void {
    while (this.#scheduler.peek()?.time === time) this.#scheduler.pop();
  }
}

export function createSimulationRuntime(
  project: Project,
  registry: ComponentRegistry,
  behaviors: BehaviorRegistry,
  options?: SimulationOptions,
): SimulationRuntime {
  return new SimulationRuntime(project, registry, behaviors, options);
}
