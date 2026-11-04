import type { ApiResult, LoxilbApiClient } from "./client";
import type { DeviceInfoEntry, FileSystemInfoEntry, ProcessStatus, VersionEntry } from "./models";

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
}
