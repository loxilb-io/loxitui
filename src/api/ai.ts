import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  ConversationCleanupResponse,
  GPUEnableResponse,
  GPUMonitoringStatus,
  OPAWatcherConfig,
  OPAWatcherStatus,
  PostSuccessResponse,
  TraceCatalogEntry,
  TraceParserInfo,
  TraceParserList,
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
