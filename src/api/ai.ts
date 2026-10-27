import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  AIObjectiveEntry,
  AIObjectiveList,
  AiModelProfileEntry,
  AiModelProfileRegistry,
  ApiKeyPatch,
  ConversationCleanupResponse,
  GPUEnableResponse,
  GPUMonitoringStatus,
  JWTAuthProfileEntry,
  JWTAuthProfileList,
  KvInventory,
  NetIdentityEntry,
  NetIdentityList,
  OPAWatcherConfig,
  OPAWatcherStatus,
  PostSuccessResponse,
  RateLimitDefaultsEntry,
  RateLimitDefaultsMod,
  TraceCatalogEntry,
  TraceParserInfo,
  TraceParserList,
  UserRateLimitEntry,
  UserRateLimitMod,
  WorkerMetricsEntry,
  WorkerMetricsResponse,
  WorkerMetricsUpdateResponse,
} from "./models";

export class AiGatewayApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async getGPUStatus(): Promise<ApiResult<GPUMonitoringStatus>> {
    return this.c.get<GPUMonitoringStatus>("/config/gpu/status");
  }

  /** POST /config/gpu/enable — activate GPU-aware routing */
  async enableGPU(): Promise<ApiResult<GPUEnableResponse>> {
    return this.c.post<GPUEnableResponse>("/config/gpu/enable");
  }

  /** POST /config/gpu/disable — revert to standard CHWBL routing */
  async disableGPU(): Promise<ApiResult<GPUEnableResponse>> {
    return this.c.post<GPUEnableResponse>("/config/gpu/disable");
  }

  /** POST /config/gpu/conversations/cleanup — remove stale conversation mappings */
  async cleanupGPUConversations(
    maxAgeHours?: number
  ): Promise<ApiResult<ConversationCleanupResponse>> {
    const q = maxAgeHours !== undefined ? `?max_age_hours=${maxAgeHours}` : "";
    return this.c.post<ConversationCleanupResponse>(`/config/gpu/conversations/cleanup${q}`);
  }

  /** GET /config/worker/metrics — current GPU metrics for all tracked workers */
  async getWorkerMetrics(): Promise<ApiResult<WorkerMetricsResponse>> {
    return this.c.get<WorkerMetricsResponse>("/config/worker/metrics");
  }

  /** POST /config/worker/metrics — push GPU metrics for one worker */
  async updateWorkerMetrics(
    entry: WorkerMetricsEntry
  ): Promise<ApiResult<WorkerMetricsUpdateResponse>> {
    return this.c.post<WorkerMetricsUpdateResponse>("/config/worker/metrics", entry);
  }

  /** GET /config/opa/watcher — OPA L4 policy watcher status */
  async getOPAWatcher(): Promise<ApiResult<OPAWatcherStatus>> {
    return this.c.get<OPAWatcherStatus>("/config/opa/watcher");
  }

  /** POST /config/opa/watcher — start or reconfigure the OPA watcher */
  async setOPAWatcher(cfg: OPAWatcherConfig): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.post<PostSuccessResponse>("/config/opa/watcher", cfg);
  }

  /** DELETE /config/opa/watcher — stop and remove the OPA watcher */
  async deleteOPAWatcher(): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.del<PostSuccessResponse>("/config/opa/watcher");
  }

  /** PATCH /config/ai/apikey/{key_id} — change a key's models, state or limits in place */
  async patchAPIKey(keyId: string, patch: ApiKeyPatch): Promise<ApiResult<void>> {
    return this.c.patch<void>(`/config/ai/apikey/${encodeURIComponent(keyId)}`, patch);
  }

  /** GET /config/ai/kv/inventory — KV blocks held for one service endpoint */
  async getKVInventory(serviceId: number, epIdx: number): Promise<ApiResult<KvInventory>> {
    return this.c.get<KvInventory>(
      `/config/ai/kv/inventory?service_id=${serviceId}&ep_idx=${epIdx}`,
      // A 64-bit hash parsed as a JSON number rounds past 2^53-1, so its digits are quoted first.
      (text) => JSON.parse(text.replace(/"hash_uint64":\s*(\d+)/g, '"hash_uint64":"$1"'))
    );
  }

  async listModelProfiles(): Promise<ApiResult<AiModelProfileRegistry>> {
    return this.c.get<AiModelProfileRegistry>("/config/ai/model-profiles");
  }

  async getModelProfile(profileId: string): Promise<ApiResult<AiModelProfileEntry>> {
    return this.c.get<AiModelProfileEntry>(
      `/config/ai/model-profiles/${encodeURIComponent(profileId)}`
    );
  }

  async listObjectives(): Promise<ApiResult<AIObjectiveList>> {
    return this.c.get<AIObjectiveList>("/config/ai/objective");
  }

  /** POST /config/ai/objective — create, or replace an objective of the same name */
  async setObjective(entry: AIObjectiveEntry): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.post<PostSuccessResponse>("/config/ai/objective", entry);
  }

  /** DELETE /config/ai/objective/{name} — tenants and keys naming it then ask for an unknown one */
  async deleteObjective(name: string): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.del<PostSuccessResponse>(`/config/ai/objective/${encodeURIComponent(name)}`);
  }

  async listNetIdentities(): Promise<ApiResult<NetIdentityEntry[]>> {
    const result = await this.c.get<NetIdentityList>("/config/ai/netidentity");
    if (!result.ok) return result;
    return { ok: true, data: result.data.netIdentityAttr ?? [] };
  }

  /** POST /config/ai/netidentity — create, or replace a binding of the same name */
  async setNetIdentity(entry: NetIdentityEntry): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.post<PostSuccessResponse>("/config/ai/netidentity", entry);
  }

  /** DELETE /config/ai/netidentity/{name} — its network's next request is decided without it */
  async deleteNetIdentity(name: string): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.del<PostSuccessResponse>(`/config/ai/netidentity/${encodeURIComponent(name)}`);
  }

  async listJWTAuthProfiles(): Promise<ApiResult<JWTAuthProfileEntry[]>> {
    const result = await this.c.get<JWTAuthProfileList>("/config/ai/jwtauthprofile");
    if (!result.ok) return result;
    return { ok: true, data: result.data.jwtAuthProfileAttr ?? [] };
  }

  /** POST /config/ai/jwtauthprofile — create, or replace a profile of the same name */
  async setJWTAuthProfile(entry: JWTAuthProfileEntry): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.post<PostSuccessResponse>("/config/ai/jwtauthprofile", entry);
  }

  /** DELETE /config/ai/jwtauthprofile/{name} — 409 while an LB rule still references it */
  async deleteJWTAuthProfile(name: string): Promise<ApiResult<PostSuccessResponse>> {
    return this.c.del<PostSuccessResponse>(`/config/ai/jwtauthprofile/${encodeURIComponent(name)}`);
  }

  /** POST /config/ai/ratelimit/defaults — set the global row, or one rule's row */
  async setRateLimitDefaults(entry: RateLimitDefaultsMod): Promise<ApiResult<void>> {
    return this.c.post<void>("/config/ai/ratelimit/defaults", entry);
  }

  async getRateLimitDefaults(
    scope: "global" | "rule",
    ruleIdent?: string
  ): Promise<ApiResult<RateLimitDefaultsEntry>> {
    const q = scope === "rule" && ruleIdent ? `?rule_ident=${encodeURIComponent(ruleIdent)}` : "";
    return this.c.get<RateLimitDefaultsEntry>(`/config/ai/ratelimit/defaults/${scope}${q}`);
  }

  /** DELETE /config/ai/ratelimit/defaults/{scope} — its identities fall to the next level */
  async deleteRateLimitDefaults(
    scope: "global" | "rule",
    ruleIdent?: string
  ): Promise<ApiResult<void>> {
    const q = scope === "rule" && ruleIdent ? `?rule_ident=${encodeURIComponent(ruleIdent)}` : "";
    return this.c.del<void>(`/config/ai/ratelimit/defaults/${scope}${q}`);
  }

  /** POST /config/ai/user/ratelimit — create or replace one user's explicit limits */
  async setUserRateLimit(entry: UserRateLimitMod): Promise<ApiResult<void>> {
    return this.c.post<void>("/config/ai/user/ratelimit", entry);
  }

  /** GET /config/ai/user/ratelimit/{tenant_id} — rows without model limits */
  async listUserRateLimits(tenantId: string): Promise<ApiResult<UserRateLimitEntry[]>> {
    const result = await this.c.get<UserRateLimitEntry[]>(
      `/config/ai/user/ratelimit/${encodeURIComponent(tenantId)}`
    );
    if (!result.ok) return result;
    return { ok: true, data: result.data ?? [] };
  }

  async getUserRateLimit(tenantId: string, userId: string): Promise<ApiResult<UserRateLimitEntry>> {
    return this.c.get<UserRateLimitEntry>(
      `/config/ai/user/ratelimit/${encodeURIComponent(tenantId)}/${encodeURIComponent(userId)}`
    );
  }

  /** DELETE /config/ai/user/ratelimit/{tenant_id}/{user_id} — the user falls back to defaults */
  async deleteUserRateLimit(tenantId: string, userId: string): Promise<ApiResult<void>> {
    return this.c.del<void>(
      `/config/ai/user/ratelimit/${encodeURIComponent(tenantId)}/${encodeURIComponent(userId)}`
    );
  }

  async listTraceParsers(): Promise<ApiResult<TraceParserInfo[]>> {
    const result = await this.c.get<TraceParserList>("/config/trace/parsers");
    if (!result.ok) {
      if (result.error.status === 404) return { ok: true, data: [] };
      return result;
    }
    return { ok: true, data: result.data.parsers ?? [] };
  }

  /**
   * The gateway declares GET /config/trace/catalogs but has not wired the
   * handler yet (x-not-implemented, returns 501) — treat 501/404 as "no
   * catalogs" so the panel lights up automatically once it ships.
   */
  async listTraceCatalogs(): Promise<ApiResult<TraceCatalogEntry[]>> {
    const result = await this.c.get<TraceCatalogEntry[]>("/config/trace/catalogs");
    if (!result.ok) {
      if (result.error.status === 501 || result.error.status === 404) {
        return { ok: true, data: [] };
      }
      return result;
    }
    return { ok: true, data: result.data ?? [] };
  }
}
