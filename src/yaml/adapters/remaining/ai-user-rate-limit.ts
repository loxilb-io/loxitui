/**
 * AiUserRateLimit adapter — flat adapter.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiUserRateLimitAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiUserRateLimit");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new AiUserRateLimitAdapter());
