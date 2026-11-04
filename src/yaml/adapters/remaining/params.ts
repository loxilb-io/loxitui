import { adapterRegistry } from "../adapter-registry.js";
/**
 * Params adapter — singleton.
 */
import { BaseResourceAdapter } from "../base-adapter.js";

export class ParamsAdapter extends BaseResourceAdapter {
  constructor() {
    super("Params");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new ParamsAdapter());
