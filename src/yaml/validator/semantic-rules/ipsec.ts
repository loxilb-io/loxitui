/**
 * Semantic validation rules for IpsecTunnel resources.
 * Catches auth mode dependencies, CIDR format in selectors, and mobike/ikev2 requirement.
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

export function validateIpsecTunnelSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // authMode=psk requires psk field
  if (spec.authMode === "psk" && !spec.psk) {
    errors.push(
      makeError(
        resource,
        "psk",
        "PSK authentication mode requires psk field",
        'Add psk: "<pre-shared-key>" when using authMode: psk'
      )
    );
  }

  // authMode=cert requires certName and caCertName
  if (spec.authMode === "cert") {
    if (!spec.certName) {
      errors.push(
        makeError(
          resource,
          "certName",
          "Certificate authentication mode requires certName",
          "Add certName when using authMode: cert"
        )
      );
    }
    if (!spec.caCertName) {
      errors.push(
        makeError(
          resource,
          "caCertName",
          "Certificate authentication mode requires caCertName",
          "Add caCertName when using authMode: cert"
        )
      );
    }
  }

  // CIDR format in selector
  const selector = spec.selector as Record<string, unknown> | undefined;
  if (selector && typeof selector === "object") {
    if (typeof selector.srcCidr === "string" && selector.srcCidr !== "") {
      if (!isValidCidr(selector.srcCidr)) {
        errors.push(
          makeError(
            resource,
            "selector.srcCidr",
            `Invalid CIDR format: "${selector.srcCidr}"`,
            "Use valid CIDR notation (e.g., 10.0.0.0/24)"
          )
        );
      }
    }
    if (typeof selector.dstCidr === "string" && selector.dstCidr !== "") {
      if (!isValidCidr(selector.dstCidr)) {
        errors.push(
          makeError(
            resource,
            "selector.dstCidr",
            `Invalid CIDR format: "${selector.dstCidr}"`,
            "Use valid CIDR notation (e.g., 10.0.0.0/24)"
          )
        );
      }
    }
  }

  // MOBIKE requires IKEv2
  if (spec.mobike === true && spec.ikeVersion !== "ikev2" && spec.ikeVersion !== 2) {
    errors.push(
      makeError(
        resource,
        "mobike",
        "MOBIKE requires IKEv2",
        "Set ikeVersion: ikev2 when using mobike: true"
      )
    );
  }

  return errors;
}
