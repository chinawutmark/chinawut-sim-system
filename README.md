# CHINAWUT Sim System

Universal embedded, IoT, automation, and engineering simulation platform. The foundation is vendor-neutral and versioned: hardware/component definitions describe what devices are, while the project domain layer describes how concrete instances are configured and connected.

## Hardware definition architecture

`src/hardware/types.ts` defines first-class boards, sensors, actuators, displays, communications, power, and custom components. All definitions share identity, pin, interface, electrical, schema-version, source/plugin, and metadata primitives. Vendor catalogs are ordinary data that a `ComponentRegistry` validates and indexes, keeping product-specific knowledge out of the eventual simulation kernel.

Add a board or sensor by constructing its typed declarative definition and registering it. No engine branch or vendor class is needed. `src/hardware/samples.ts` contains a deliberately small proof catalog; applications and future plugins should keep larger catalogs in separate packages.

## Project domain architecture

`src/domain/` builds on the hardware catalog instead of defining a second hardware model. A `ComponentInstance` references one registered definition by stable ID and stores only project-owned data such as placement, configuration, aliases, and active pin assignments.

Connections are represented as versioned `Net` records with stable endpoint references. Nets explicitly distinguish physical/electrical wiring, buses, network membership, and logical/protocol relationships, so the same project can later represent GPIO wiring, shared I2C/CAN buses, power rails, and non-physical IoT relationships without coupling the model to one controller family.

The project validator checks missing definitions/endpoints, pin-function capability conflicts, duplicate assignments, interface mismatches, direction conflicts, I2C address collisions, UART configuration mismatches, obvious voltage/supply problems, and missing common-ground warnings. Full electrical solving and protocol execution remain future milestones.

## Deterministic simulation runtime

The architecture is deliberately layered: `src/hardware/` declares reusable catalog facts, `src/domain/` persists instances and nets, and `src/simulation/` adds transient execution state. Simulation never edits a project or component definition. Instead, each runtime owns component input/output/state records, endpoint and net values, diagnostics, a bounded event log, and a deterministic event queue.

`SimulationRuntime` uses a monotonic virtual clock rather than wall time. Events are ordered by timestamp, explicit numeric priority, and a monotonically assigned insertion order. `step()` processes one event and `runUntil(time)` processes all events through an inclusive timestamp. External values are always injected as scheduled events; reset clears execution state and deterministically initializes it again.

Signals are type-safe discriminated unions for digital (including unknown and high impedance), analog values with units, PWM, pulses, bytes, and structured logical data. An output change uses a prebuilt endpoint-to-net index, resolves the shared net, and schedules changes for every other endpoint. Equal signals are suppressed. Same-time and total-event limits turn non-settling feedback into runtime diagnostics rather than hanging the process. Optional per-net `propagationDelayMs` establishes a latency boundary; protocol engines can later schedule their own events without being embedded in the propagation kernel.

Behaviors are factories held in a `BehaviorRegistry`. An instance selects a behavior through `configuration.behaviorId`, falling back to its definition ID. The engine therefore contains no board/vendor switch. Built-ins cover controllable digital/analog/PWM sources, a digital indicator, relay, PWM actuator, and small declarative controller expressions (input, constant, comparison, boolean operators, and output mapping). Plugin, custom-component, protocol-adapter, and future fault behaviors use the same controlled context.

For example, a scheduled `HIGH` at a sensor causes `sensor:pin:out` to drive its digital net; that schedules the controller input change; a declarative controller rule drives its output; and the next net causes an LED behavior to store `on = true`. UI code can consume a cloned `SimulationSnapshot` and structured event log without access to mutable maps.

Static validation and runtime diagnostics are separate concerns: project validation reports invalid configuration before execution, while simulation diagnostics report unresolved behaviors, malformed signals, conflicting drivers, behavior exceptions, event limits, and oscillation at a virtual timestamp.

## Commands

```sh
npm install
npm test
npm run typecheck
```
