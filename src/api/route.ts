import type { ApiResult, LoxilbApiClient } from "./client";
import type { RouteEntry } from "./models";

interface RouteList {
  routeAttr?: RouteEntry[];
}

export class RouteApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<RouteEntry[]>> {
    // swagger: GET /config/route/all → Go JSON tag: json:"routeAttr" (get_config_route_all.go:86)
    const result = await this.c.get<RouteList>("/config/route/all");
    if (!result.ok) return result;
    return { ok: true, data: result.data.routeAttr ?? [] };
  }

  async create(route: RouteEntry): Promise<ApiResult<void>> {
    // swagger: POST /config/route — bare RouteEntry body
    return this.c.post<void>("/config/route", route);
  }

  async delete(route: Pick<RouteEntry, "destinationIPNet">): Promise<ApiResult<void>> {
    // swagger: DELETE /config/route/destinationIPNet/{ip_address}/{mask}
    const [ip, mask] = route.destinationIPNet.split("/");
    return this.c.del<void>(`/config/route/destinationIPNet/${ip}/${mask ?? "32"}`);
  }
}
