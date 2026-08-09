/**
 * Cert adapter — TLS certificate bundles keyed by certId.
 * The gateway declares no list endpoint (GET requires {certId}), so live
 * state is unreadable and the diff engine treats every spec as CREATE.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class CertAdapter extends BaseResourceAdapter {
  constructor() {
    super("Cert");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new CertAdapter());
