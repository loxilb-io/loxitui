import type { ApiResult, LoxilbApiClient } from "./client";
import type { EndPointGetEntry, EndPointList, EndPointMod } from "./models";

export class EndpointApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<EndPointGetEntry[]>> {
    const result = await this.c.get<EndPointList>("/config/endpoint/all");
    if (!result.ok) return result;
    // swagger: Attr → Go JSON tag: json:"Attr" (get_config_endpoint_all.go:86)
    return { ok: true, data: result.data.Attr ?? [] };
  }

  async create(ep: EndPointMod): Promise<ApiResult<void>> {
    return this.c.post<void>("/config/endpoint", ep);
  }

  async delete(ep: Pick<EndPointMod, "epIP">): Promise<ApiResult<void>> {
    // swagger: DELETE /config/endpoint/epipaddress/{ip_address}
    return this.c.del<void>(`/config/endpoint/epipaddress/${ep.epIP}`);
  }
}
