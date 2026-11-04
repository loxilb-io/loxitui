/**
 * SecurityRate adapter — singleton, strips stats block.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class SecurityRateAdapter extends BaseResourceAdapter {
  constructor() {
    super("SecurityRate");
  }

  protected computedFields(): string[] {
    return ["stats"];
  }
}

adapterRegistry.register(new SecurityRateAdapter());
