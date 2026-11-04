import { adapterRegistry } from "../adapter-registry.js";
/**
 * IpsecConfig adapter — singleton.
 */
import { BaseResourceAdapter } from "../base-adapter.js";

export class IpsecConfigAdapter extends BaseResourceAdapter {
  constructor() {
    super("IpsecConfig");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new IpsecConfigAdapter());
