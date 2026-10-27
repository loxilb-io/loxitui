import type { ApiResult, LoxilbApiClient } from "./client";
import type {
  AuditNamedSink,
  AuditPolicy,
  AuditRotateResult,
  AuditSink,
  AuditStatus,
} from "./models";

/**
 * The gateway's management audit trail (/audit/*). Not to be confused with
 * the TUI's own local audit log in src/audit.
 */
export class AuditApi {
  constructor(private readonly c: LoxilbApiClient) {}

  async getStatus(): Promise<ApiResult<AuditStatus>> {
    return this.c.get<AuditStatus>("/audit/status");
  }

  async getPolicy(): Promise<ApiResult<AuditPolicy>> {
    return this.c.get<AuditPolicy>("/audit/policy");
  }

  /** POST /audit/policy — replace the runtime-changeable policy; values below the profile floor are refused */
  async setPolicy(policy: AuditPolicy): Promise<ApiResult<void>> {
    return this.c.post<void>("/audit/policy", policy);
  }

  async getSink(): Promise<ApiResult<AuditSink>> {
    return this.c.get<AuditSink>("/audit/sink");
  }

  /** POST /audit/sink — configure the compliance syslog sink; a config without a CA bundle is refused */
  async setSink(sink: AuditSink): Promise<ApiResult<void>> {
    return this.c.post<void>("/audit/sink", sink);
  }

  async getNamedSink(name: string): Promise<ApiResult<AuditNamedSink>> {
    return this.c.get<AuditNamedSink>(`/audit/sinks/${encodeURIComponent(name)}`);
  }

  /** PUT /audit/sinks/{name} — create or replace a secondary sink */
  async setNamedSink(name: string, sink: AuditNamedSink): Promise<ApiResult<void>> {
    return this.c.put<void>(`/audit/sinks/${encodeURIComponent(name)}`, sink);
  }

  /** DELETE /audit/sinks/{name} — stop a secondary sink; its trail position and sequence are kept */
  async deleteNamedSink(name: string): Promise<ApiResult<void>> {
    return this.c.del<void>(`/audit/sinks/${encodeURIComponent(name)}`);
  }

  /** POST /audit/rotate — seal the active segment and open the next */
  async rotate(): Promise<ApiResult<AuditRotateResult>> {
    return this.c.post<AuditRotateResult>("/audit/rotate");
  }
}
