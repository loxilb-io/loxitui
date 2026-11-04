/**
 * BgpPolicyApply adapter — DELETE /config/bgp/policy/apply takes the
 * same body as POST (no path-parameter delete is declared).
 */

import type { ApiResult } from "@/api/client.js";
import type { LoxilbApi } from "@/api/index.js";
import type { YamlResource } from "../../types.js";
import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class BgpPolicyApplyAdapter extends BaseResourceAdapter {
  constructor() {
    super("BgpPolicyApply");
  }

  protected computedFields(): string[] {
    return [];
  }

  override async delete(api: LoxilbApi, resource: YamlResource): Promise<ApiResult<void>> {
    const body = this.toApiBody(resource.spec);
    return api.raw.del("/config/bgp/policy/apply", body) as Promise<ApiResult<void>>;
  }
}

adapterRegistry.register(new BgpPolicyApplyAdapter());
