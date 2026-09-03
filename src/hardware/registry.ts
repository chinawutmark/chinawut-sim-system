import type { ComponentDefinition, ComponentKind } from "./types.js";
import { assertValidDefinition } from "./validation.js";

export class DuplicateComponentIdError extends Error { constructor(id: string) { super(`Component definition '${id}' is already registered`); this.name = "DuplicateComponentIdError"; } }
export interface ComponentQuery { kind?: ComponentKind; category?: string; manufacturer?: string; model?: string; tags?: readonly string[] }

/** Catalog boundary: the simulation engine consumes this interface, never vendor-specific classes. */
export class ComponentRegistry {
  readonly #definitions = new Map<string, ComponentDefinition>();
  register(definition: ComponentDefinition): this { assertValidDefinition(definition); if (this.#definitions.has(definition.id)) throw new DuplicateComponentIdError(definition.id); this.#definitions.set(definition.id, definition); return this; }
  registerAll(definitions: Iterable<ComponentDefinition>): this { for (const definition of definitions) this.register(definition); return this; }
  get(id: string): ComponentDefinition | undefined { return this.#definitions.get(id); }
  require(id: string): ComponentDefinition { const value = this.get(id); if (!value) throw new Error(`Unknown component definition '${id}'`); return value; }
  search(query: ComponentQuery = {}): readonly ComponentDefinition[] {
    const eq = (a: string | undefined, b: string | undefined) => b === undefined || a?.toLowerCase() === b.toLowerCase();
    return [...this.#definitions.values()].filter(value => eq(value.kind, query.kind) && eq(value.category, query.category) && eq(value.manufacturer, query.manufacturer) && eq(value.model, query.model) && (query.tags?.every(tag => value.tags?.includes(tag)) ?? true));
  }
  get size(): number { return this.#definitions.size; }
}
