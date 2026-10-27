import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  DpuDebugAction,
  DpuDebugActionResult,
  DpuDebugQuery,
  DpuDebugResponse,
  DpuHwCounters,
} from "./models";

/**
 * DPU offload debug routes. They are raw handlers on the gateway, so the
 * shapes come from swagger-extras.yml, not the generated main spec. Their
 * uint64 counters stay plain numbers on purpose: they are only shown and
 * totalled, where rounding past 2^53-1 is a negligible relative error,
 * unlike the KV inventory hashes in ai.ts, which must stay exact.
 */
export class DpuApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async getDebug(query: DpuDebugQuery = {}): Promise<ApiResult<DpuDebugResponse>> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const q = params.size ? `?${params}` : "";
    return this.c.get<DpuDebugResponse>(`/config/dpu/debug${q}`);
  }

  /** POST /config/dpu/debug — unregister a plugin or force the circuit breaker */
  async runDebugAction(action: DpuDebugAction): Promise<ApiResult<DpuDebugActionResult>> {
    return this.c.post<DpuDebugActionResult>("/config/dpu/debug", action);
  }

  async getHWCounters(): Promise<ApiResult<DpuHwCounters>> {
    return this.c.get<DpuHwCounters>("/config/dpu/hwcounters");
  }
}
