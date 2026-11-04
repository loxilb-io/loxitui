import type { ApiResult, LoxilbApiClient } from "./client";
import type { ConnAttr, ConntrackList } from "./models";

export class ConntrackApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async list(): Promise<ApiResult<ConnAttr[]>> {
    const result = await this.c.get<ConntrackList>("/config/conntrack/all");
    if (!result.ok) return result;
    // Normalize: API may return [{}] or [{"flows": null}] for empty conntrack
    const raw = result.data.ctAttr ?? [];
    const filtered = raw.filter(
      (entry) => entry && typeof entry === "object" && Object.keys(entry).length > 0
    );
    return { ok: true, data: filtered };
  }
}
