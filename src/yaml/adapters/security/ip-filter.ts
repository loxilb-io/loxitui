/**
 * IpFilter adapter — flat adapter.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class IpFilterAdapter extends BaseResourceAdapter {
  constructor() {
    super("IpFilter");
  }

  protected computedFields(): string[] {
    return [];
  }

  /** Zone is an optional query param — append it only when the spec sets it. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    let path = super.buildDeletePath(spec);
    if (spec.zone != null) path += `&zone=${encodeURIComponent(String(spec.zone))}`;
    return path;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.security.listIPFilter();
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

adapterRegistry.register(new IpFilterAdapter());
