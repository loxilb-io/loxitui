/**
 * Endpoint adapter — strips runtime state computed fields from GET responses.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class EndpointAdapter extends BaseResourceAdapter {
  constructor() {
    super("Endpoint");
  }

  protected computedFields(): string[] {
    return ["currState", "probeDuration", "inactiveReTries", "avgDelay", "minDelay", "maxDelay"];
  }

  /** DELETE /config/endpoint/epipaddress/{ip} narrows by optional query params. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    let path = `/config/endpoint/epipaddress/${encodeURIComponent(String(spec.hostName ?? ""))}`;
    const query = new URLSearchParams();
    if (spec.name != null) query.set("name", String(spec.name));
    if (spec.probeType != null) query.set("probe_type", String(spec.probeType));
    if (spec.probePort != null) query.set("probe_port", String(spec.probePort));
    const qs = query.toString();
    if (qs) path += `?${qs}`;
    return path;
  }

  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.ep.list();
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

adapterRegistry.register(new EndpointAdapter());
