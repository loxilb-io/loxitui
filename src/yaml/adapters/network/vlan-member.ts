/**
 * VlanMember adapter — nested under a parent VLAN.
 * The `vid` spec field is a path parameter (schema augmentation), stripped
 * from POST bodies; the member list is derived from GET /config/vlan/all.
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";
import type { NormalizedResource } from "../types.js";

export class VlanMemberAdapter extends BaseResourceAdapter {
  constructor() {
    super("VlanMember");
  }
  protected computedFields(): string[] {
    return [];
  }

  override toApiBody(spec: Record<string, unknown>): Record<string, unknown> {
    const body = super.toApiBody(spec);
    delete body.vid;
    return body;
  }

  /** tagged is part of the delete path; default false when the spec omits it. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    return super.buildDeletePath({ tagged: false, ...spec });
  }

  /** The gateway has no member list endpoint — flatten members from the VLAN list. */
  override async getAll(api: LoxilbApi): Promise<ApiResult<NormalizedResource[]>> {
    const result = await api.raw.get<Record<string, unknown>>("/config/vlan/all");
    if (!result.ok) return result as ApiResult<NormalizedResource[]>;

    const vlans = this.extractItems(result.data);
    const normalized: NormalizedResource[] = [];
    for (const vlan of vlans) {
      const members = vlan.member;
      if (!Array.isArray(members)) continue;
      for (const member of members as Record<string, unknown>[]) {
        const spec = { vid: vlan.vid, ...member };
        normalized.push({
          kind: this.kind,
          identityKey: this.extractIdentityKey(spec),
          spec: this.normalizeGetResponse(spec),
        });
      }
    }

    return { ok: true, data: normalized };
  }
}

adapterRegistry.register(new VlanMemberAdapter());
