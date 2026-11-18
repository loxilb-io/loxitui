/**
 * AiJwtAuthProfile adapter — drops the null audiences and algs GET reports
 * for a profile that leaves them unset.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiJwtAuthProfileAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiJwtAuthProfile");
  }
  protected computedFields(): string[] {
    return [];
  }

  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = structuredClone(apiItem);
    // An unset list reads back as null, which the schema refuses and the YAML never carries
    if (result.audiences === null) delete result.audiences;
    if (result.algs === null) delete result.algs;
    return result;
  }

  /** GET wraps the list in jwtAuthProfileAttr, which an empty list may omit (not a singleton). */
  protected override extractItems(
    responseData: Record<string, unknown>
  ): Record<string, unknown>[] {
    return (responseData.jwtAuthProfileAttr as Record<string, unknown>[] | undefined) ?? [];
  }
}

adapterRegistry.register(new AiJwtAuthProfileAdapter());
