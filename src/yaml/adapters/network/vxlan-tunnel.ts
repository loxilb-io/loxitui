/**
 * VxlanTunnel adapter — flat adapter.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class VxlanTunnelAdapter extends BaseResourceAdapter {
  constructor() {
    super("VxlanTunnel");
  }

  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new VxlanTunnelAdapter());
