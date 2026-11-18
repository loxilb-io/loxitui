/**
 * AiNetIdentity adapter — flat adapter.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiNetIdentityAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiNetIdentity");
  }
  protected computedFields(): string[] {
    return [];
  }

  /** GET wraps the list in netIdentityAttr, which an empty list may omit (not a singleton). */
  protected override extractItems(
    responseData: Record<string, unknown>
  ): Record<string, unknown>[] {
    return (responseData.netIdentityAttr as Record<string, unknown>[] | undefined) ?? [];
  }
}

adapterRegistry.register(new AiNetIdentityAdapter());
