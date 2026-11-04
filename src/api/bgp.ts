import type { ApiResult, LoxilbApiClient } from "./client";
import type { BgpNeighEntry, BgpPolicyDefinition, BgpPolicyDefinitionList } from "./models";

interface BgpNeighList {
  bgpNeiAttr?: BgpNeighEntry[];
}

export class BgpApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async listNeighbors(): Promise<ApiResult<BgpNeighEntry[]>> {
    const result = await this.c.get<BgpNeighList>("/config/bgp/neigh/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.bgpNeiAttr ?? [] };
  }

  async listPolicyDefinitions(): Promise<ApiResult<BgpPolicyDefinition[]>> {
    const result = await this.c.get<BgpPolicyDefinitionList>("/config/bgp/policy/definitions/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.bgpPolicy ?? [] };
  }
}
