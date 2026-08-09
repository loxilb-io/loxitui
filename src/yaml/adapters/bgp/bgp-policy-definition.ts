/**
 * BgpPolicyDefinition adapter — flat adapter.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class BgpPolicyDefinitionAdapter extends BaseResourceAdapter {
  constructor() {
    super("BgpPolicyDefinition");
  }

  protected computedFields(): string[] {
    return [];
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.bgp.listPolicyDefinitions();
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

adapterRegistry.register(new BgpPolicyDefinitionAdapter());
