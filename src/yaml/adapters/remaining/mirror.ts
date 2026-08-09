/**
 * Mirror adapter — strips info.portNum computed field.
 */
import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class MirrorAdapter extends BaseResourceAdapter {
  constructor() {
    super("Mirror");
  }
  protected computedFields(): string[] {
    return [];
  }

  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(apiItem);
    const info = result.info as Record<string, unknown> | undefined;
    if (info) {
      delete info.portNum;
    }
    return result;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.network.listMirrors();
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

adapterRegistry.register(new MirrorAdapter());
