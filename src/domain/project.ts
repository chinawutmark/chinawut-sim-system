import type { ComponentDefinition, InterfaceDefinition, PinDefinition } from "../hardware/types.js";
import type { ComponentRegistry } from "../hardware/registry.js";
import { PROJECT_SCHEMA_VERSION, type ComponentInstance, type EndpointRef, type Project, type ValidationIssue } from "./types.js";
import { validateProject } from "./validate.js";

export type ResolvedEndpoint =
  | { reference: EndpointRef; instance: ComponentInstance; definition: ComponentDefinition; kind: "pin"; pin: PinDefinition }
  | { reference: EndpointRef; instance: ComponentInstance; definition: ComponentDefinition; kind: "interface"; interface: InterfaceDefinition };

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

export function createInstance(id: string, definitionId: string, name: string, x = 0, y = 0): ComponentInstance {
  return { id, definitionId, name, position: { x, y }, enabled: true, pinAssignments: [] };
}

/** Deterministic formatting without mutating caller-owned arrays. */
export function serializeProject(project: Project): string {
  const stable = {
    ...project,
    instances: [...project.instances].sort((a, b) => a.id.localeCompare(b.id)),
    nets: [...project.nets].sort((a, b) => a.id.localeCompare(b.id)).map((net) => ({
      ...net,
      endpoints: [...net.endpoints].sort((a, b) => `${a.instanceId}:${a.endpointKind}:${a.endpointId}`.localeCompare(`${b.instanceId}:${b.endpointKind}:${b.endpointId}`)),
    })),
  };
  return JSON.stringify(stable, null, 2);
}

export interface ProjectLoadResult { project?: Project; issues: ValidationIssue[] }

/** Parses and validates a project at the persistence boundary; malformed files never throw. */
export function loadProject(json: string, registry: ComponentRegistry): ProjectLoadResult {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { return { issues: [{ code: "INVALID_JSON", severity: "error", message: "Project file is not valid JSON" }] }; }
  if (!isProject(value)) return { issues: [{ code: "INVALID_PROJECT", severity: "error", message: "Project file is missing required fields or uses an unsupported schema version" }] };
  return { project: value, issues: validateProject(value, registry) };
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Project>;
  return candidate.schemaVersion === PROJECT_SCHEMA_VERSION && typeof candidate.id === "string" && typeof candidate.name === "string"
    && typeof candidate.createdAt === "string" && typeof candidate.updatedAt === "string"
    && Array.isArray(candidate.instances) && Array.isArray(candidate.nets);
}
