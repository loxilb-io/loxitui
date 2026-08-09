/**
 * Neighbor adapter — strips state computed field.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class NeighborAdapter extends BaseResourceAdapter {
  constructor() {
    super("Neighbor");
  }

  protected computedFields(): string[] {
    return ["state"];
  }
}

adapterRegistry.register(new NeighborAdapter());
