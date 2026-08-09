import type { ApiResult, LoxilbApiClient } from "./client";
import type { LbServiceArg, LbServiceList, LoadbalanceStats, LoadbalanceStatus } from "./models";

export class LbApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<LbServiceArg[]>> {
    const result = await this.c.get<LbServiceList>("/config/loadbalancer/all");
    if (!result.ok) return result;
    return { ok: true, data: result.data.lbAttr ?? [] };
  }

  async create(svc: LbServiceArg): Promise<ApiResult<void>> {
    return this.c.post<void>("/config/loadbalancer", svc);
  }

  async delete(
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol">
  ): Promise<ApiResult<void>> {
    // swagger: DELETE /config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}`;
    return this.c.del<void>(path);
  }

  /** GET …/externalipaddress/{ip}/port/{port}/protocol/{proto}/status — per-rule lifecycle status */
  async getStatus(
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol">
  ): Promise<ApiResult<LoadbalanceStatus>> {
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}/status`;
    return this.c.get<LoadbalanceStatus>(path);
  }

  /** GET …/externalipaddress/{ip}/port/{port}/protocol/{proto}/stats — per-rule traffic stats */
  async getStats(
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol">
  ): Promise<ApiResult<LoadbalanceStats>> {
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}/stats`;
    return this.c.get<LoadbalanceStats>(path);
  }
}
