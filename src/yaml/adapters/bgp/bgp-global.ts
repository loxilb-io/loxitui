/**
 * BgpGlobal adapter — singleton (identityFields=[]).
 * The gateway declares POST only; live state is unreadable, so the diff
 * engine always re-applies (POST is upsert).
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class BgpGlobalAdapter extends BaseResourceAdapter {
  constructor() {
    super("BgpGlobal");
  }

  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new BgpGlobalAdapter());
