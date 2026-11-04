import { adapterRegistry } from "../adapter-registry.js";
/**
 * AiTenantRateLimit adapter — flat adapter.
 */
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiTenantRateLimitAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiTenantRateLimit");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new AiTenantRateLimitAdapter());
