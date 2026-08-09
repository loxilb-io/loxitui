/**
 * BgpPolicyDefinedSet adapter — the `type` spec field is a path parameter
 * (schema augmentation) substituted into {type} on create/delete and
 * stripped from POST bodies.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class BgpPolicyDefinedSetAdapter extends BaseResourceAdapter {
  constructor() {
    super("BgpPolicyDefinedSet");
  }

  protected computedFields(): string[] {
    return [];
  }

  override toApiBody(spec: Record<string, unknown>): Record<string, unknown> {
    const body = super.toApiBody(spec);
    delete body.type;
    return body;
  }
}

adapterRegistry.register(new BgpPolicyDefinedSetAdapter());
