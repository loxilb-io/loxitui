/**
 * AiRateLimitDefaults adapter — one defaults row per scope: "global", or
 * "rule" for the service named by rule_ident.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiRateLimitDefaultsAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiRateLimitDefaults");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new AiRateLimitDefaultsAdapter());
