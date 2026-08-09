/**
 * Layer 2 (Semantic) validation orchestrator.
 * Runs cross-field validation rules that JSON Schema cannot express.
 *
 * Rules are registered per-kind and run against the resource spec.
 * Kinds without registered rules automatically pass semantic validation.
 */

import type { ValidationError, YamlResource } from "../types.js";
import { validateBgpGlobalSemantic, validateBgpNeighborSemantic } from "./semantic-rules/bgp.js";
import { validateFirewallSemantic } from "./semantic-rules/firewall.js";
import { validateIpsecTunnelSemantic } from "./semantic-rules/ipsec.js";
import { validateLoadBalancerSemantic } from "./semantic-rules/loadbalancer.js";

/** A semantic rule set validates a spec and returns ValidationErrors */
export type SemanticRuleSet = (
  spec: Record<string, unknown>,
  resource: YamlResource
) => ValidationError[];

/** Registry of semantic rules keyed by resource kind */
const SEMANTIC_RULES = new Map<string, SemanticRuleSet>([
  ["LoadBalancer", validateLoadBalancerSemantic],
  ["Firewall", validateFirewallSemantic],
  ["IpsecTunnel", validateIpsecTunnelSemantic],
  ["BgpGlobal", validateBgpGlobalSemantic],
  ["BgpNeighbor", validateBgpNeighborSemantic],
]);

/**
 * Register a semantic rule set for a resource kind.
 */
export function registerSemanticRules(kind: string, rules: SemanticRuleSet): void {
  SEMANTIC_RULES.set(kind, rules);
}

/**
 * Run semantic (cross-field) validation for a resource.
 * Returns empty array if no rules exist for the kind (valid by default).
 */
export function validateSemantic(resource: YamlResource): ValidationError[] {
  const rules = SEMANTIC_RULES.get(resource.kind);
  if (!rules) {
    return [];
  }

  return rules(resource.spec, resource);
}
