#!/usr/bin/env bash
#
# release-hygiene.sh — repeatable hygiene gate for the public repository.
# Fails non-zero on any finding. Checks the *committed* tree (HEAD) and the
# commit range being published.
#
# Usage: scripts/release-hygiene.sh [--base <ref>] [--skip-gitleaks]
set -u

BASE=""
SKIP_GITLEAKS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --skip-gitleaks) SKIP_GITLEAKS=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

FAIL=0
fail() { FAIL=1; printf 'FAIL: %s\n' "$1"; }
pass() { printf 'ok:   %s\n' "$1"; }

if [ -z "$BASE" ] && git rev-parse -q --verify origin/main >/dev/null 2>&1; then
  BASE=$(git merge-base origin/main HEAD 2>/dev/null || true)
fi
RANGE=${BASE:+$BASE..}HEAD
SELF=':(exclude)scripts/release-hygiene.sh'

# 1. AI attribution in commit messages
if git log --format='%an %ae %B' "$RANGE" 2>/dev/null \
     | grep -qiE 'claude|anthropic|copilot|openai codex|co-authored-by:.*(bot|ai)'; then
  fail "AI attribution found in commit messages ($RANGE)"
else
  pass "commit messages clean ($RANGE)"
fi

# 2. AI tooling artifacts tracked
if git ls-files | grep -qE '(^|/)(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.mcp\.json)$|(^|/)(\.claude|claudedocs|\.planning|\.serena|claude-agents)/'; then
  fail "AI tooling artifacts are tracked"
else
  pass "no AI tooling artifacts tracked"
fi

# 3. Private/internal paths tracked
if git ls-files | grep -qE '^(docs/internal/|private/|\.private/)'; then
  fail "private/internal paths are tracked"
else
  pass "no private/internal paths tracked"
fi

# 4. Personal identifiers
if git grep -Iqn -E '/Users/[a-z]+|/home/(kong|gongseoghwan)' HEAD -- "$SELF" 2>/dev/null; then
  fail "personal paths in tracked files:"
  git grep -In -E '/Users/[a-z]+|/home/(kong|gongseoghwan)' HEAD -- "$SELF" | head -20
else
  pass "no personal paths"
fi

# 5. Links into docs/internal/
if git grep -Iqn 'docs/internal/' HEAD -- ':(exclude).gitignore' "$SELF" 2>/dev/null; then
  fail "tracked files link into docs/internal/"
else
  pass "no docs/internal references"
fi

# 6. Private key material
KEY_HDR='BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
key_hits=""
for f in $(git grep -IlE "$KEY_HDR" HEAD -- "$SELF" 2>/dev/null | sed 's/^HEAD://'); do
  blob=$(git show "HEAD:$f" 2>/dev/null) || continue
  if printf '%s' "$blob" | grep -Eq 'PRIVATE KEY-----\\n[A-Za-z0-9+/]{40,}' \
     || printf '%s\n' "$blob" | grep -Eq '^[A-Za-z0-9+/]{40,}={0,2}$'; then
    key_hits="$key_hits $f"
  fi
done
if [ -n "$key_hits" ]; then fail "private key material in:$key_hits"; else pass "no private key material"; fi

# 7. Secrets — gitleaks
if [ "$SKIP_GITLEAKS" = 1 ]; then
  echo "skip: gitleaks (--skip-gitleaks)"
elif command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --source . --no-banner --redact >/dev/null 2>&1; then pass "gitleaks clean"
  else fail "gitleaks found candidate secrets"; fi
else
  fail "gitleaks not installed (use --skip-gitleaks to bypass locally)"
fi

# 8. Governance files present
for f in LICENSE NOTICE GOVERNANCE.md MAINTAINERS.md SECURITY.md CODE_OF_CONDUCT.md CONTRIBUTING.md .github/CODEOWNERS; do
  git cat-file -e "HEAD:$f" 2>/dev/null && continue
  fail "required governance file missing from HEAD: $f"
done

exit $FAIL
