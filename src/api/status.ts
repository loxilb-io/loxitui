import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  CapabilityStatusList,
  DeviceInfoEntry,
  DiagnosticsStatus,
  FileSystemInfoEntry,
  MaintenanceRequest,
  MaintenanceStatus,
  ProcessStatus,
  ReadyStatus,
  VersionEntry,
} from "./models";

interface ProcessStatusResponse {
  processAttr?: ProcessStatus[];
}

interface FilesystemStatusResponse {
  fileSysAttr?: FileSystemInfoEntry[];
}

export class StatusApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async processes(): Promise<ApiResult<ProcessStatus[]>> {
    const result = await this.c.get<ProcessStatusResponse>("/status/process");
    if (!result.ok) return result;
    return { ok: true, data: result.data.processAttr ?? [] };
  }

  async device(): Promise<ApiResult<DeviceInfoEntry>> {
    return this.c.get<DeviceInfoEntry>("/status/device");
  }

  async filesystem(): Promise<ApiResult<FileSystemInfoEntry[]>> {
    const result = await this.c.get<FilesystemStatusResponse>("/status/filesystem");
    if (!result.ok) return result;
    return { ok: true, data: result.data.fileSysAttr ?? [] };
  }

  async version(): Promise<ApiResult<VersionEntry>> {
    return this.c.get<VersionEntry>("/version");
  }

  /**
   * GET /status/ready — configuration-recovery readiness. "Not ready" is a 503
   * whose body is the same ReadyStatus with the reasons, so it is data, not an error.
   * A credential-store 503 carries an Error body instead and stays an error.
   */
  async ready(): Promise<ApiResult<ReadyStatus>> {
    const result = await this.c.get<ReadyStatus>("/status/ready");
    if (!result.ok && result.error.status === 503) {
      const body = result.error.body as ReadyStatus | undefined;
      if (typeof body?.ready === "boolean") return { ok: true, data: body };
    }
    return result;
  }

  /** GET /status/capabilities — launch-environment capabilities; using a not-ready one gets 412 */
  async capabilities(modelName?: string): Promise<ApiResult<CapabilityStatusList>> {
    const q = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    return this.c.get<CapabilityStatusList>(`/status/capabilities${q}`);
  }

  /** GET /diagnostics — secret-safe build, readiness, attachment and map utilization report */
  async diagnostics(): Promise<ApiResult<DiagnosticsStatus>> {
    return this.c.get<DiagnosticsStatus>("/diagnostics");
  }

  async maintenance(): Promise<ApiResult<MaintenanceStatus>> {
    return this.c.get<MaintenanceStatus>("/maintenance");
  }

  /** PUT /maintenance — enter or leave operator maintenance (idempotent) */
  async setMaintenance(req: MaintenanceRequest): Promise<ApiResult<MaintenanceStatus>> {
    return this.c.put<MaintenanceStatus>("/maintenance", req);
  }
}
