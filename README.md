# CHINAWUT Sim System

Universal embedded, IoT, automation, and engineering simulation platform. The first domain package is a vendor-neutral, versioned hardware definition model; it deliberately contains metadata and validation rather than CPU, protocol, or electrical simulation behavior.

## Hardware definition architecture

`src/hardware/types.ts` defines first-class boards, sensors, actuators, displays, communications, power, and custom components. All definitions share identity, pin, interface, electrical, schema-version, source/plugin, and metadata primitives. Vendor catalogs are ordinary data that a `ComponentRegistry` validates and indexes, keeping product-specific knowledge out of the eventual simulation kernel.

Add a board or sensor by constructing its typed declarative definition and registering it. No engine branch or vendor class is needed. `src/hardware/samples.ts` contains a deliberately small proof catalog; applications and future plugins should keep larger catalogs in separate packages.

## Commands

```sh
npm install
npm test
```
