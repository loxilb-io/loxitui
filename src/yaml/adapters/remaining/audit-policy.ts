/**
 * AuditPolicy adapter — singleton.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AuditPolicyAdapter extends BaseResourceAdapter {
  constructor() {
    super("AuditPolicy");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new AuditPolicyAdapter());
