/**
 * Registers all semantic rule sets with the semantic validator.
 * Import this module to ensure all rules are available.
 */

import { registerSemanticRules } from "../semantic-validator.js";
import { validateBgpGlobalSemantic, validateBgpNeighborSemantic } from "./bgp.js";
import { validateFirewallSemantic } from "./firewall.js";
import { validateIpsecTunnelSemantic } from "./ipsec.js";
import { validateLoadBalancerSemantic } from "./loadbalancer.js";

registerSemanticRules("LoadBalancer", validateLoadBalancerSemantic);
registerSemanticRules("Firewall", validateFirewallSemantic);
registerSemanticRules("IpsecTunnel", validateIpsecTunnelSemantic);
registerSemanticRules("BgpGlobal", validateBgpGlobalSemantic);
registerSemanticRules("BgpNeighbor", validateBgpNeighborSemantic);
