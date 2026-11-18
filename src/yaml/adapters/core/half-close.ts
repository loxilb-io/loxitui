/**
 * HalfClose adapter — singleton.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class HalfCloseAdapter extends BaseResourceAdapter {
  constructor() {
    super("HalfClose");
  }

  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new HalfCloseAdapter());
