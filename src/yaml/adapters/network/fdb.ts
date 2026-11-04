/**
 * Fdb adapter — flat adapter.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class FdbAdapter extends BaseResourceAdapter {
  constructor() {
    super("Fdb");
  }

  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new FdbAdapter());
