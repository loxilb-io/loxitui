/**
 * Semantic validation rules for AiUserRateLimit and AiRateLimitDefaults resources.
 * Catches rows the gateway refuses: a scope and rule_ident that disagree, and
 * entries that set no limit.
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

export function validateAiUserRateLimitSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // An all-zero entry is refused (zero falls through to the defaults); burst_size is not a limit
  const modelLimits = (spec.model_limits as Record<string, unknown>[] | undefined) ?? [];
  const limits = [spec.rps, spec.tokens_per_min, ...modelLimits.map((ml) => ml.tokens_per_min)];
  if (!limits.some((v) => typeof v === "number" && v > 0)) {
    errors.push(
      makeError(
        resource,
        "",
        "a user rate-limit entry must set at least one non-zero limit",
        "Set rps, tokens_per_min or a model_limits tokens_per_min above zero"
      )
    );
  }

  return errors;
}

export function validateAiRateLimitDefaultsSemantic(
  spec: Record<string, unknown>,
  resource: YamlResource
): ValidationError[] {
  const errors: ValidationError[] = [];

  // scope global applies everywhere and takes no rule_ident; scope rule names one service
  if (spec.scope === "global" && spec.rule_ident) {
    errors.push(
      makeError(
        resource,
        "rule_ident",
        "scope 'global' does not take a rule_ident",
        "Remove rule_ident, or set scope: rule to limit only that service"
      )
    );
  }
  if (spec.scope === "rule" && !spec.rule_ident) {
    errors.push(
      makeError(
        resource,
        "rule_ident",
        "scope 'rule' requires a rule_ident",
        "Add rule_ident naming the service, or set scope: global"
      )
    );
  }

  // An all-zero row is refused, as for user entries
  const limits = [
    spec.default_user_rps,
    spec.default_user_tpm,
    spec.default_tenant_rps,
    spec.default_tenant_tpm,
    spec.vip_shared_rps,
    spec.vip_shared_tpm,
  ];
  if (!limits.some((v) => typeof v === "number" && v > 0)) {
    errors.push(
      makeError(
        resource,
        "",
        "a defaults row must set at least one non-zero limit",
        "Set one of the default_* or vip_shared_* limits above zero"
      )
    );
  }

  return errors;
}
