/**
 * Semantic validation rules for AuditSink resources.
 * Catches sink settings the gateway would silently drop.
 */

import type { ValidationError, YamlResource } from "../../types.js";

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

export function validateAuditSinkSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // A POST that is not enabled ends the sink and clears its configuration, and still answers 204
  if (spec.enabled !== true) {
    const settings = [
      "address",
      "ca_bundle_path",
      "server_name",
      "client_cert_path",
      "client_key_path",
      "max_frame_bytes",
      "facility",
    ].filter((field) => spec[field] !== undefined);
    if (settings.length > 0) {
      errors.push(
        makeError(
          resource,
          "enabled",
          `${settings.join(", ")} set but enabled is not true; the gateway removes the sink and drops them`,
          "Set enabled: true to configure the sink; to remove it, declare enabled: false alone"
        )
      );
    }
  }

  return errors;
}
