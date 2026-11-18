import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  HalfCloseConfig,
  KvExactStatusEntry,
  KvExactStatusList,
  LbServiceArg,
  LbServiceList,
  LoadbalanceStats,
  LoadbalanceStatus,
  PostSuccessResponse,
  SockMapResetResult,
} from "./models";

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
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol" | "model_name">
  ): Promise<ApiResult<void>> {
    // swagger: DELETE /config/loadbalancer/externalipaddress/{ip}/port/{port}/protocol/{proto}
    // model_name is part of the rule key: without it only the model-less rule matches.
    const q = svc.model_name ? `?model_name=${encodeURIComponent(svc.model_name)}` : "";
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}${q}`;
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

  /** GET …/externalipaddress/{ip}/port/{port}/protocol/{proto}/kvexactstatus — KV-exact binding status */
  async getKVExactStatus(
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol">,
    modelName?: string
  ): Promise<ApiResult<KvExactStatusEntry[]>> {
    const q = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}/kvexactstatus${q}`;
    const result = await this.c.get<KvExactStatusList>(path);
    if (!result.ok) return result;
    return { ok: true, data: result.data.kvExactStatusAttr ?? [] };
  }

  /** POST …/externalipaddress/{ip}/port/{port}/protocol/{proto}/sockmapreset — close accelerated connections */
  async resetSockMap(
    svc: Pick<LbServiceArg["serviceArguments"], "externalIP" | "port" | "protocol">
  ): Promise<ApiResult<SockMapResetResult>> {
    const path = `/config/loadbalancer/externalipaddress/${svc.externalIP}/port/${svc.port}/protocol/${svc.protocol}/sockmapreset`;
    return this.c.post<SockMapResetResult>(path);
  }

  async getHalfClose(): Promise<ApiResult<HalfCloseConfig>> {
    return this.c.get<HalfCloseConfig>("/config/halfclose");
  }

  /** POST /config/halfclose — process-wide hold settings; omitted fields keep their value */
  async setHalfClose(cfg: HalfCloseConfig): Promise<ApiResult<HalfCloseConfig>> {
    return this.c.post<HalfCloseConfig>("/config/halfclose", cfg);
  }

  /** POST /config/halfclose/release — close every held half-closed client on every service */
  async releaseHalfClose(): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.post<PostSuccessResponse>("/config/halfclose/release");
  }
}
