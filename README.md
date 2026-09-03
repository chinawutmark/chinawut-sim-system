# CHINAWUT Sim System

Universal embedded, IoT, automation, and engineering simulation platform. The foundation is vendor-neutral and versioned: hardware/component definitions describe what devices are, while the project domain layer describes how concrete instances are configured and connected.

## Hardware definition architecture

`src/hardware/types.ts` defines first-class boards, sensors, actuators, displays, communications, power, and custom components. All definitions share identity, pin, interface, electrical, schema-version, source/plugin, and metadata primitives. Vendor catalogs are ordinary data that a `ComponentRegistry` validates and indexes, keeping product-specific knowledge out of the eventual simulation kernel.

Add a board or sensor by constructing its typed declarative definition and registering it. No engine branch or vendor class is needed. `src/hardware/samples.ts` contains a deliberately small proof catalog; applications and future plugins should keep larger catalogs in separate packages.

## Project domain architecture

`src/domain/` builds on the hardware catalog instead of defining a second hardware model. A `ComponentInstance` references one registered definition by stable ID and stores only project-owned data such as placement, configuration, aliases, and active pin assignments.

Connections are represented as versioned `Net` records with stable endpoint references. Nets explicitly distinguish physical/electrical wiring, buses, network membership, and logical/protocol relationships, so the same project can later represent GPIO wiring, shared I2C/CAN buses, power rails, and non-physical IoT relationships without coupling the model to one controller family.

The project validator checks missing definitions/endpoints, pin-function capability conflicts, duplicate assignments, interface mismatches, direction conflicts, I2C address collisions, UART configuration mismatches, obvious voltage/supply problems, and missing common-ground warnings. Full electrical solving and protocol execution remain future milestones.

## Commands

```sh
npm install
npm test
npm run typecheck
```
