import type { ApiError, ApiResult, LoxilbApiClient } from "./client";
import type { PersistResult, RestoreResult } from "./models";

/**
 * Config lifecycle operations: export, snapshot, restore, persist.
 * Export/snapshot return the raw JSON document as text so callers can write
 * it to disk verbatim (checksums stay valid).
 */
export class ConfigLifecycleApi {
  constructor(private readonly c: LoxilbApiClient) {}

  /** GET /config/export — legacy component export (JSON document as text). */
  async exportConfig(
    components?: string[]
  ): Promise<{ ok: true; text: string } | { ok: false; error: ApiError }> {
    const q = components?.length ? `?components=${encodeURIComponent(components.join(","))}` : "";
    return this.c.getText(`/config/export${q}`);
  }

  /** GET /config/snapshot — versioned, checksummed snapshot document as text. */
  async snapshot(
    components?: string[]
  ): Promise<{ ok: true; text: string } | { ok: false; error: ApiError }> {
    const q = components?.length ? `?components=${encodeURIComponent(components.join(","))}` : "";
    return this.c.getText(`/config/snapshot${q}`);
  }

  /**
   * POST /config/restore — staged restore of a snapshot document.
   * Default mode is dry-run (validate + plan, no mutation); pass "commit"
   * to apply with automatic rollback on failure.
   */
  async restore(
    snapshot: unknown,
    mode: "dry-run" | "commit" = "dry-run"
  ): Promise<ApiResult<RestoreResult>> {
    return this.c.post<RestoreResult>(`/config/restore?mode=${mode}`, snapshot);
  }

  /** POST /config/persist — persist the running config to disk on the gateway. */
  async persist(): Promise<ApiResult<PersistResult>> {
    return this.c.post<PersistResult>("/config/persist");
  }
}
