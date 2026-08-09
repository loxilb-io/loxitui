/**
 * Firewall adapter — handles ruleArguments wrapper and opts.counter stripping.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class FirewallAdapter extends BaseResourceAdapter {
  constructor() {
    super("Firewall");
  }

  protected computedFields(): string[] {
    return [];
  }

  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(apiItem);
    // Strip opts.counter (computed field)
    const opts = result.opts as Record<string, unknown> | undefined;
    if (opts) {
      delete opts.counter;
    }
    return result;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.security.listFirewall();
    if (!result.ok) return result as ApiResult<NormalizedResource[]>;

    const normalized: NormalizedResource[] = result.data.map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        kind: this.kind,
        identityKey: this.extractIdentityKey(raw),
        spec: this.normalizeGetResponse(raw),
      };
    });

    return { ok: true, data: normalized };
  }
}

adapterRegistry.register(new FirewallAdapter());
