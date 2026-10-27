/**
 * AiObjective adapter — strips the server-assigned updated_at.
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
}

adapterRegistry.register(new AiObjectiveAdapter());
