/**
 * Vlan adapter — flat adapter.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class VlanAdapter extends BaseResourceAdapter {
  constructor() {
    super("Vlan");
  }

  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new VlanAdapter());
