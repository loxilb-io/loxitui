import type { ApiResult, LoxilbApiClient } from "./client";
import type { CiStateEntry, CiStateList } from "./models";

export class ClusterApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<CiStateEntry[]>> {
    const result = await this.c.get<CiStateList>("/config/cistate/all");
    if (!result.ok) {
      // Not all loxilb deployments have cluster configured — treat 404 as empty
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    // swagger: Attr → Go JSON tag: json:"Attr" (get_config_cistate_all.go:86)
    return { ok: true, data: result.data.Attr ?? [] };
  }
}
