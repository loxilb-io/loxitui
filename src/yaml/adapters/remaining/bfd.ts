/**
 * Bfd adapter — uses api.bfd.list().
 */
import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class BfdAdapter extends BaseResourceAdapter {
  constructor() {
    super("Bfd");
  }
  protected computedFields(): string[] {
    return [];
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.bfd.list();
    if (!result.ok) return result as ApiResult<NormalizedResource[]>;
    return {
      ok: true,
      data: result.data.map((item) => {
        const raw = item as unknown as Record<string, unknown>;
        return {
          kind: this.kind,
          identityKey: this.extractIdentityKey(raw),
          spec: this.normalizeGetResponse(raw),
        };
      }),
    };
  }
}

adapterRegistry.register(new BfdAdapter());
