/**
 * IPv6Address adapter — flat adapter, mirrors IPv4Address.
 */

import { adapterRegistry } from "../adapter-registry.js";
import { BaseResourceAdapter } from "../base-adapter.js";

export class IPv6AddressAdapter extends BaseResourceAdapter {
  constructor() {
    super("IPv6Address");
  }

  protected computedFields(): string[] {
    return [];
  }

  /** Delete path splits the ipAddress CIDR into /{ip}/{mask} segments. */
  protected override buildDeletePath(spec: Record<string, unknown>): string {
    const [ip, mask] = String(spec.ipAddress ?? "").split("/");
    return `/config/ipv6address/${encodeURIComponent(ip ?? "")}/${encodeURIComponent(mask ?? "128")}/dev/${encodeURIComponent(String(spec.dev ?? ""))}`;
  }
}

adapterRegistry.register(new IPv6AddressAdapter());
