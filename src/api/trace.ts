import type { ApiResult, LoxilbApiClient } from "./client";
import type { TraceStatus } from "./models";

export class TraceApi {
  constructor(private readonly c: LoxilbApiClient) {}

  /**
   * Returns a 2-element array:
   *   [0] HTTP/HTTPS trace status (label: "HTTP")
   *   [1] L4 connection trace status (label: "L4")
   */
  async list(): Promise<ApiResult<TraceStatus[]>> {
    const [httpRes, l4Res] = await Promise.allSettled([
      this.c.get<TraceStatus>("/config/trace/status"),
      this.c.get<TraceStatus>("/config/l4trace/status"),
    ]);

    const http: TraceStatus =
      httpRes.status === "fulfilled" && httpRes.value.ok
        ? { ...httpRes.value.data, label: "HTTP" }
        : { traceEnable: false, label: "HTTP" };

    const l4: TraceStatus =
      l4Res.status === "fulfilled" && l4Res.value.ok
        ? { ...l4Res.value.data, label: "L4" }
        : { l4TraceEnable: false, label: "L4" };

    return { ok: true, data: [http, l4] };
  }

  /**
   * Enable trace by index:
   *   0 → POST /config/trace/enable (HTTP trace)
   *   1 → POST /config/l4trace/enable (L4 trace)
   */
  async enable(idx: number): Promise<ApiResult<void>> {
    const path = idx === 0 ? "/config/trace/enable" : "/config/l4trace/enable";
    return this.c.post<void>(path);
  }

  /**
   * Disable trace by index:
   *   0 → POST /config/trace/disable (HTTP trace)
   *   1 → POST /config/l4trace/disable (L4 trace)
   */
  async disable(idx: number): Promise<ApiResult<void>> {
    const path = idx === 0 ? "/config/trace/disable" : "/config/l4trace/disable";
    return this.c.post<void>(path);
  }
}
