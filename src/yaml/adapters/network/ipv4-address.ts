/**
 * IPv4Address adapter — flat adapter.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class IPv4AddressAdapter extends BaseResourceAdapter {
  constructor() {
    super("IPv4Address");
  }

  protected computedFields(): string[] {
    return [];
  }

  /** Delete path splits the ipAddress CIDR into /{ip}/{mask} segments. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    const [ip, mask] = String(spec.ipAddress ?? "").split("/");
    return `/config/ipv4address/${encodeURIComponent(ip ?? "")}/${encodeURIComponent(mask ?? "32")}/dev/${encodeURIComponent(String(spec.dev ?? ""))}`;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.network.listIPv4Addresses();
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

adapterRegistry.register(new IPv4AddressAdapter());
