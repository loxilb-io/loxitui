import { adapterRegistry } from "../adapter-registry.js";
/**
 * IpsecCaCertificate adapter — uses api.raw (no facade method).
 */
import { BaseResourceAdapter } from "../base-adapter.js";

export class IpsecCaCertificateAdapter extends BaseResourceAdapter {
  constructor() {
    super("IpsecCaCertificate");
  }
  protected computedFields(): string[] {
    return [];
  }
}

adapterRegistry.register(new IpsecCaCertificateAdapter());
