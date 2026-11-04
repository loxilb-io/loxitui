/**
 * Adapter registry: maps kind strings to ResourceAdapter instances.
 * Singleton pattern — adapters self-register at import time.
 */

import type { ResourceAdapter } from "./types.js";

export class AdapterRegistry {
  private adapters = new Map<string, ResourceAdapter>();

  /** Register an adapter for its kind */
  register(adapter: ResourceAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  /** Look up an adapter by kind string */
  get(kind: string): ResourceAdapter | undefined {
    return this.adapters.get(kind);
  }

  /** Return all registered kind strings */
  allKinds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/** Singleton registry instance */
export const adapterRegistry = new AdapterRegistry();
