/**
 * VxlanPeer adapter — nested under a parent VxLAN tunnel.
 * The `vxlanID` spec field is a path parameter (schema augmentation),
 * stripped from POST bodies. The gateway declares no peer list endpoint.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class VxlanPeerAdapter extends BaseResourceAdapter {
  constructor() {
    super("VxlanPeer");
  }
  protected computedFields(): string[] {
    return [];
  }

  override toApiBody(spec: Record<string, unknown>): Record<string, unknown> {
    const body = super.toApiBody(spec);
    delete body.vxlanID;
    return body;
  }
}

adapterRegistry.register(new VxlanPeerAdapter());
