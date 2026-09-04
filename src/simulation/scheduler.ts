import type { SimulationEvent, SimulationEventType } from "./types.js";
export interface ScheduleRequest { time: number; type: SimulationEventType; target?: string; payload?: unknown; priority?: number; source?: string; metadata?: Readonly<Record<string, unknown>> }
/** Stable min-queue. Contract: time, explicit priority, then monotonically assigned insertion order. */
export class DeterministicScheduler {
  #events: SimulationEvent[] = []; #order = 0;
  schedule(request: ScheduleRequest): SimulationEvent {
    if (!Number.isFinite(request.time) || request.time < 0) throw new RangeError("Event time must be a non-negative finite number");
    const order = this.#order++; const event: SimulationEvent = { id: `event-${order}`, time: request.time, type: request.type, priority: request.priority ?? 100, order, ...(request.target === undefined ? {} : { target: request.target }), ...(request.payload === undefined ? {} : { payload: request.payload }), ...(request.source === undefined ? {} : { source: request.source }), ...(request.metadata === undefined ? {} : { metadata: request.metadata }) };
    this.#events.push(event); this.#events.sort((a,b) => a.time-b.time || a.priority-b.priority || a.order-b.order); return event;
  }
  peek(): SimulationEvent | undefined { return this.#events[0]; }
  pop(): SimulationEvent | undefined { return this.#events.shift(); }
  clear(): void { this.#events = []; this.#order = 0; }
  get size(): number { return this.#events.length; }
}
