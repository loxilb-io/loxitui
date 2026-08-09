/**
 * Route adapter — strips protocol computed field.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class RouteAdapter extends BaseResourceAdapter {
  constructor() {
    super("Route");
  }

  protected computedFields(): string[] {
    return ["protocol"];
  }

  /** Delete path splits the destinationIPNet CIDR into /{ip}/{mask} segments. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    const cidr = String(spec.destinationIPNet ?? "");
    const [ip, mask] = cidr.split("/");
    return `/config/route/destinationIPNet/${encodeURIComponent(ip ?? "")}/${encodeURIComponent(mask ?? "32")}`;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.route.list();
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

adapterRegistry.register(new RouteAdapter());
