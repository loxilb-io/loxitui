/**
 * Semantic validation rules for Firewall resources.
 * Catches mutually exclusive actions, redirect dependencies, port ranges, and CIDR format.
 */

import type { ValidationError, YamlResource } from "../../types.js";
import { isValidCidr } from "../formats.js";

function makeError(
  resource: YamlResource,
  fieldPath: string,
  message: string,
  suggestion: string
): ValidationError {
  return {
    resourceName: resource.metadata.name,
    kind: resource.kind,
    fieldPath,
    message,
    suggestion,
    layer: "semantic",
  };
}

export function validateFirewallSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];
  const opts = spec.opts as Record<string, unknown> | undefined;
  const ruleArgs = spec.ruleArguments as Record<string, unknown> | undefined;

  if (opts) {
    // Mutually exclusive actions: at most one of drop, trap, redirect, allow
    const actions = ["drop", "trap", "redirect", "allow"].filter((a) => opts[a] === true);
    if (actions.length > 1) {
      errors.push(
        makeError(
          resource,
          "opts",
          `Mutually exclusive actions set: ${actions.join(", ")}`,
          "Set only one of: drop, trap, redirect, allow"
        )
      );
    }

    // redirect requires redirectPortName
    if (opts.redirect === true && !opts.redirectPortName) {
      errors.push(
        makeError(
          resource,
          "opts.redirectPortName",
          "redirect is enabled but redirectPortName is not set",
          "Add redirectPortName when using redirect: true"
        )
      );
    }
  }

  if (ruleArgs) {
    // Port range validity: min must not exceed max
    const minSrc = ruleArgs.minSourcePort;
    const maxSrc = ruleArgs.maxSourcePort;
    if (typeof minSrc === "number" && typeof maxSrc === "number" && minSrc > maxSrc) {
      errors.push(
        makeError(
          resource,
          "ruleArguments.minSourcePort",
          `minSourcePort (${minSrc}) exceeds maxSourcePort (${maxSrc})`,
          "Ensure minSourcePort <= maxSourcePort"
        )
      );
    }

    const minDst = ruleArgs.minDestinationPort;
    const maxDst = ruleArgs.maxDestinationPort;
    if (typeof minDst === "number" && typeof maxDst === "number" && minDst > maxDst) {
      errors.push(
        makeError(
          resource,
          "ruleArguments.minDestinationPort",
          `minDestinationPort (${minDst}) exceeds maxDestinationPort (${maxDst})`,
          "Ensure minDestinationPort <= maxDestinationPort"
        )
      );
    }

    // CIDR format validation for sourceIP and destinationIP
    if (typeof ruleArgs.sourceIP === "string" && ruleArgs.sourceIP !== "") {
      if (!isValidCidr(ruleArgs.sourceIP)) {
        errors.push(
          makeError(
            resource,
            "ruleArguments.sourceIP",
            `Invalid CIDR format: "${ruleArgs.sourceIP}"`,
            "Use valid CIDR notation (e.g., 10.0.0.0/24)"
          )
        );
      }
    }

    if (typeof ruleArgs.destinationIP === "string" && ruleArgs.destinationIP !== "") {
      if (!isValidCidr(ruleArgs.destinationIP)) {
        errors.push(
          makeError(
            resource,
            "ruleArguments.destinationIP",
            `Invalid CIDR format: "${ruleArgs.destinationIP}"`,
            "Use valid CIDR notation (e.g., 10.0.0.0/24)"
          )
        );
      }
    }
  }

  return errors;
}
