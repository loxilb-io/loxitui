import type { ApiResult, LoxilbApiClient } from "./client";

export interface LogResponse {
  logs: string[];
  log_file: string;
  log_count: number;
  has_more: boolean;
  next_cursor?: string;
  total_size?: number;
}

export class LogApi {
  constructor(private readonly c: LoxilbApiClient) {}

  /** Fetch log lines. Pass `cursor` to load an older page (pagination). */
  async list(count = 100, cursor?: string): Promise<ApiResult<LogResponse>> {
    const params = new URLSearchParams({ count: String(count) });
    if (cursor) params.set("cursor", cursor);
    return this.c.get<LogResponse>(`/logs?${params.toString()}`);
  }
}
