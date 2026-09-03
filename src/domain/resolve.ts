import type { ComponentDefinition, InterfaceDefinition, PinDefinition } from "../hardware/types.js";
import type { ComponentRegistry } from "../hardware/registry.js";
import type { ComponentInstance, EndpointRef, Project } from "./types.js";

export type ResolvedEndpoint =
  | { reference: EndpointRef; instance: ComponentInstance; definition: ComponentDefinition; kind: "pin"; pin: PinDefinition }
  | { reference: EndpointRef; instance: ComponentInstance; definition: ComponentDefinition; kind: "interface"; interface: InterfaceDefinition };

/** Resolves a stable project endpoint reference through the shared Task 3 hardware registry. */
export function resolveEndpoint(project: Project, registry: ComponentRegistry, ref: EndpointRef): ResolvedEndpoint | undefined {
  const instance = project.instances.find((item) => item.id === ref.instanceId);
  if (!instance) return undefined;
  const definition = registry.get(instance.definitionId);
  if (!definition) return undefined;

  if (ref.endpointKind === "pin") {
    const pin = definition.pins.find((item) => item.id === ref.endpointId);
    return pin ? { reference: ref, instance, definition, kind: "pin", pin } : undefined;
  }

  const iface = (definition.interfaces ?? []).find((item) => item.id === ref.endpointId);
  return iface ? { reference: ref, instance, definition, kind: "interface", interface: iface } : undefined;
}
