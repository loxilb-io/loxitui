import type { ApiResult, LoxilbApiClient } from "./client";
import type { BfdGetEntry, BfdList } from "./models";

export class BfdApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<BfdGetEntry[]>> {
    const result = await this.c.get<BfdList>("/config/bfd/all");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.bfdAttr ?? [] };
  }
}
