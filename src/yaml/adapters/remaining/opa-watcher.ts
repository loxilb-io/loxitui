import { adapterRegistry } from "../adapter-registry.js";
/**
 * OpaWatcher adapter — singleton.
 */
import { BaseResourceAdapter } from "../base-adapter.js";

export class OpaWatcherAdapter extends BaseResourceAdapter {
  constructor() {
    super("OpaWatcher");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new OpaWatcherAdapter());
