import type { ApiResult, LoxilbApiClient } from "./client";
import type { PortEntry } from "./models";

interface PortList {
  portAttr?: PortEntry[];
}

export class PortsApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<PortEntry[]>> {
    const result = await this.c.get<PortList>("/config/port/all");
    if (!result.ok) return result;
    return { ok: true, data: result.data.portAttr ?? [] };
  }
}
