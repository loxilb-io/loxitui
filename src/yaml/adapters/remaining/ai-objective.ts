/**
 * AiObjective adapter — strips the server-assigned updated_at, and reads priority 0 as unset.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class AiObjectiveAdapter extends BaseResourceAdapter {
  constructor() {
    super("AiObjective");
  }
  protected computedFields(): string[] {
    return ["updated_at"];
  }

  /** GET wraps the list in objectiveAttr, beside source fields; an empty list may omit it. */
  protected override extractItems(
    responseData: Record<string, unknown>
  ): Record<string, unknown>[] {
    return (responseData.objectiveAttr as Record<string, unknown>[] | undefined) ?? [];
  }

  /** GET always carries priority, 0 when none was given, so 0 and an omitted priority compare equal. */
  override normalizeGetResponse(apiItem: Record<string, unknown>): Record<string, unknown> {
    const result = super.normalizeGetResponse(apiItem);
    if (result.priority === 0) delete result.priority;
    return result;
  }
}

adapterRegistry.register(new AiObjectiveAdapter());
