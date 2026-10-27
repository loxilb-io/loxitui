/**
 * AuditSink adapter — singleton; strips the session state GET reports
 * beside the sink's configuration, and the enabled: false it never reports.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AuditSinkAdapter extends BaseResourceAdapter {
  constructor() {
    super("AuditSink");
  }
  protected computedFields(): string[] {
    return ["connected", "submitted", "truncated", "write_errors", "last_error"];
  }

  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = super.normalizeGetResponse(apiItem);
    // GET leaves enabled out when no sink runs, so a declared enabled: false would never match it
    if (result.enabled === false) delete result.enabled;
    return result;
  }
}

adapterRegistry.register(new AuditSinkAdapter());
