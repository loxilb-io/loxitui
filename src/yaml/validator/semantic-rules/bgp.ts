/**
 * Semantic validation rules for BgpGlobal and BgpNeighbor resources.
 * Catches invalid router IDs, out-of-range AS numbers, and invalid IP addresses.
 */

import type { ValidationError, YamlResource } from "../../types.js";
import { isValidIpv4 } from "../formats.js";

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

export function validateBgpGlobalSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // routerId must be valid IPv4
  if (typeof spec.routerId === "string" && !isValidIpv4(spec.routerId)) {
    errors.push(
      makeError(
        resource,
        "routerId",
        `Invalid IPv4 address for routerId: "${spec.routerId}"`,
        "Use a valid IPv4 address (e.g., 1.1.1.1)"
      )
    );
  }

  // localAs must be 1-4294967295
  if (typeof spec.localAs === "number" && (spec.localAs < 1 || spec.localAs > 4294967295)) {
    errors.push(
      makeError(
        resource,
        "localAs",
        `AS number out of range: ${spec.localAs}`,
        "Use an AS number between 1 and 4294967295"
      )
    );
  }

  return errors;
}

export function validateBgpNeighborSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ipAddress must be valid IPv4
  if (typeof spec.ipAddress === "string" && !isValidIpv4(spec.ipAddress)) {
    errors.push(
      makeError(
        resource,
        "ipAddress",
        `Invalid IPv4 address: "${spec.ipAddress}"`,
        "Use a valid IPv4 address (e.g., 10.0.0.1)"
      )
    );
  }

  return errors;
}
