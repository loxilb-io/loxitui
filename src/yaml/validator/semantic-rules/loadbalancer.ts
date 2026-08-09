/**
 * Semantic validation rules for LoadBalancer resources.
 * Catches cross-field dependencies that JSON Schema cannot express.
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

export function validateLoadBalancerSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sa = spec.serviceArguments as Record<string, unknown> | undefined;

  if (!sa) return errors;

  // probeType requires monitor to be true
  if (sa.probetype && sa.monitor !== true) {
    errors.push(
      makeError(
        resource,
        "serviceArguments.probetype",
        "probetype is set but monitor is not enabled",
        "Set monitor: true when using probetype"
      )
    );
  }

  // pd_cache_aware_mode requires pd_disagg_mode
  if (sa.pd_cache_aware_mode === true && sa.pd_disagg_mode !== true) {
    errors.push(
      makeError(
        resource,
        "serviceArguments.pd_cache_aware_mode",
        "pd_cache_aware_mode requires pd_disagg_mode to be enabled",
        "Set pd_disagg_mode: true when using pd_cache_aware_mode"
      )
    );
  }

  // session_header_name requires sel=persist(3)
  if (sa.session_header_name && sa.sel !== 3 && sa.sel !== "persist") {
    errors.push(
      makeError(
        resource,
        "serviceArguments.session_header_name",
        "session_header_name requires sel to be persist (3)",
        "Set sel: persist (or sel: 3) when using session_header_name"
      )
    );
  }

  // mtls_frontend requires security >= 1 (https/tls/e2ehttps) and mode = fullproxy (4)
  if (sa.mtls_frontend) {
    const security = sa.security;
    const mode = sa.mode;
    const isSecure =
      security === 1 ||
      security === 2 ||
      security === 3 ||
      security === "https" ||
      security === "tls" ||
      security === "e2ehttps";
    const isFullproxy = mode === 4 || mode === "fullproxy";

    if (!isSecure) {
      errors.push(
        makeError(
          resource,
          "serviceArguments.mtls_frontend",
          "mtls_frontend requires security to be https (1), tls (2) or e2ehttps (3)",
          "Set security: https (or security: 1) when using mtls_frontend"
        )
      );
    }
    if (!isFullproxy) {
      errors.push(
        makeError(
          resource,
          "serviceArguments.mtls_frontend",
          "mtls_frontend requires mode to be fullproxy (4)",
          "Set mode: fullproxy (or mode: 4) when using mtls_frontend"
        )
      );
    }
  }

  // mtls_backend requires security = 3 (e2ehttps) and mode = fullproxy (4)
  if (sa.mtls_backend) {
    const security = sa.security;
    const mode = sa.mode;
    const isE2e = security === 3 || security === "e2ehttps";
    const isFullproxy = mode === 4 || mode === "fullproxy";

    if (!isE2e) {
      errors.push(
        makeError(
          resource,
          "serviceArguments.mtls_backend",
          "mtls_backend requires security to be e2ehttps (3)",
          "Set security: e2ehttps (or security: 3) when using mtls_backend"
        )
      );
    }
    if (!isFullproxy) {
      errors.push(
        makeError(
          resource,
          "serviceArguments.mtls_backend",
          "mtls_backend requires mode to be fullproxy (4)",
          "Set mode: fullproxy (or mode: 4) when using mtls_backend"
        )
      );
    }
  }

  return errors;
}
