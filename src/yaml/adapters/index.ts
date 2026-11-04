/**
 * Master adapter registration index.
 * Importing this file registers all adapters in the adapterRegistry singleton.
 * This is the single entry point for adapter access.
 */

// Re-export core types and registry
export { adapterRegistry, AdapterRegistry } from "./adapter-registry.js";
export type { ResourceAdapter, NormalizedResource, AdapterGetResult } from "./types.js";
export { BaseResourceAdapter } from "./base-adapter.js";

// ─── Core LB ─────────────────────────────────────────
import "./core/loadbalancer.js";
import "./core/endpoint.js";
import "./core/session.js";

// ─── Security ────────────────────────────────────────
import "./security/firewall.js";
import "./security/ip-filter.js";
import "./security/security-rate.js";

// ─── Network ─────────────────────────────────────────
import "./network/route.js";
import "./network/ipv4-address.js";
import "./network/ipv6-address.js";
import "./network/neighbor.js";
import "./network/fdb.js";
import "./network/vlan.js";
import "./network/vlan-member.js";
import "./network/vxlan-tunnel.js";
import "./network/vxlan-peer.js";

// ─── BGP ─────────────────────────────────────────────
import "./bgp/bgp-global.js";
import "./bgp/bgp-neighbor.js";
import "./bgp/bgp-policy-defined-set.js";
import "./bgp/bgp-policy-definition.js";
import "./bgp/bgp-policy-apply.js";

// ─── Remaining (IPsec, AI Gateway, Observability, System) ──────
import "./remaining/ipsec-tunnel.js";
import "./remaining/ipsec-certificate.js";
import "./remaining/ipsec-ca-certificate.js";
import "./remaining/ipsec-config.js";
import "./remaining/ai-api-key.js";
import "./remaining/ai-tenant-rate-limit.js";
import "./remaining/bfd.js";
import "./remaining/policy.js";
import "./remaining/mirror.js";
import "./remaining/params.js";
import "./remaining/cors.js";
import "./remaining/sni-certificate.js";
import "./remaining/opa-watcher.js";
import "./remaining/cert.js";

// NOTE: EndpointHostState is excluded — it is an operational (read-only) kind
// and does not need a configurable adapter.
