#!/usr/bin/env bash
#
# apply-governance.sh — one-shot governance hardening for loxilb-io/loxitui.
#
# Enforces that every change AND every release goes through a CODEOWNER:
#   * main: PRs only, 1 approving review that MUST come from a code owner
#     (require_code_owner_reviews), strict required status checks, conversation
#     resolution, no force-push / deletion. Admins are NOT exempt.
#   * `release` Environment: required reviewers = the code owners, self-review
#     prevented, deployments only from v* tags. release.yml's `authorize` job
#     targets it, so no tag can publish anything without an owner's approval.
#   * v* tags: creation/update/deletion restricted by a tag ruleset (only repo
#     admins may bypass).
#   * secret scanning + push protection, Dependabot security updates.
#
# Requires: gh CLI authenticated with admin on the repo.
#
# Usage:
#   OWNER_HANDLES="TrekkieCoder UltraInstinct14 backguynn inhogog2 NLX-SeokHwanKong <attlab handles>" \
#     scripts/apply-governance.sh [--apply]
#
# OWNER_HANDLES must list GitHub *logins* (the release Environment cannot
# resolve e-mail addresses); keep it in sync with .github/CODEOWNERS. Without
# --apply this is a dry run that prints every change.
#
# Sequencing: required status-check contexts must exist (run CI once on main)
# or GitHub ignores them; apply after the first green CI run.

set -euo pipefail

REPO="loxilb-io/loxitui"
CHECKS='["build-test (ubuntu-latest)", "build-test (macos-latest)", "lint", "actionlint", "dco", "hygiene gate", "full-history secret scan"]'
OWNER_HANDLES="${OWNER_HANDLES:-}"

APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

run() { echo "+ $*"; if [ "$APPLY" = "1" ]; then "$@"; fi; }

echo "── $REPO: branch protection on main (code-owner review required) ──"
run gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": $CHECKS },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": true
}
JSON

echo "── $REPO: 'release' Environment (code-owner approval gate) ──"
if [ -z "$OWNER_HANDLES" ]; then
  echo "  OWNER_HANDLES is empty — refusing to create an unguarded release environment." >&2
  [ "$APPLY" = "1" ] && exit 1
else
  reviewers="[]"
  for h in $OWNER_HANDLES; do
    id="$(gh api "users/$h" --jq .id 2>/dev/null || true)"
    if [ -z "$id" ]; then echo "  cannot resolve GitHub user '$h'" >&2; [ "$APPLY" = "1" ] && exit 1; continue; fi
    reviewers="$(printf '%s' "$reviewers" | python3 -c "import json,sys; r=json.load(sys.stdin); r.append({'type':'User','id':$id}); print(json.dumps(r))")"
  done
  run gh api -X PUT "repos/$REPO/environments/release" --input - <<JSON
{
  "reviewers": $reviewers,
  "prevent_self_review": true,
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
  run gh api -X POST "repos/$REPO/environments/release/deployment-branch-policies" \
    -f name='v*' -f type=tag
fi

echo "── $REPO: v* tag ruleset (only admins may create/move/delete release tags) ──"
run gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" } ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON

echo "── $REPO: security & analysis ──"
run gh api -X PATCH "repos/$REPO" --input - <<'JSON'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
run gh api -X PUT "repos/$REPO/vulnerability-alerts"
run gh api -X PUT "repos/$REPO/automated-security-fixes"

echo
if [ "$APPLY" = "1" ]; then echo "Applied. Verify in Settings → Branches / Rules / Environments."
else echo "Dry run only — re-run with --apply to make the changes."; fi
