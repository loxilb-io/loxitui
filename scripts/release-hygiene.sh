#!/usr/bin/env bash
#
# release-hygiene.sh — repeatable hygiene gate for the public repository.
#
# Fails non-zero on any finding. Run locally before pushing and in CI on
# every PR. Checks the *committed* tree (HEAD) and the commit range being
# published, not the working tree.
#
# Usage:
#   scripts/release-hygiene.sh [--base <ref>] [--skip-gitleaks]
#
#   --base <ref>      history range to audit is <ref>..HEAD
#                     (default: full history)
#   --skip-gitleaks   skip the gitleaks secret scan (e.g. when the binary
#                     is unavailable in a restricted CI job)
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

RANGE=${BASE:+$BASE..}HEAD

# Paths that legitimately name the patterns this script hunts for.
EXCLUDES=(':(exclude).gitignore' ':(exclude)scripts/release-hygiene.sh' ':(exclude).gitleaks.toml')

# 1. AI attribution in commit messages -----------------------------------------
# Note: this project integrates the Claude CLI as an optional AI provider, so
# the bare word "claude" is legitimate in commits (e.g. "claude-cli provider").
# Only attribution/generation trailers and author identities are flagged.
if git log --format='%an %ae %B' "$RANGE" 2>/dev/null \
     | grep -qiE 'co-authored-by:.*(claude|copilot|codex|gemini|bot|\bai\b)|generated (with|by).*(claude|copilot|codex|gemini|\bai\b)|noreply@anthropic\.com|🤖'; then
  fail "AI attribution found in commit messages ($RANGE)"
else
  pass "commit messages clean ($RANGE)"
fi

# 2. AI tooling artifacts tracked ---------------------------------------------
if git ls-files | grep -qE '(^|/)(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.mcp\.json)$|(^|/)(\.claude|claudedocs|\.planning|\.serena|claude-agents)/'; then
  fail "AI tooling artifacts are tracked"
else
  pass "no AI tooling artifacts tracked"
fi

# 3. Internal / pre-migration identifiers -------------------------------------
# Old private repo names, org, and the excised graph stack must not reappear.
# The instance-id regex requires a non-word char before "i-" so public AMI ids
# do not match.
HOSTS_RE='loxilb-enterprise|enterprise-tui|netlox-dev|(^|[^a-z])i-0[0-9a-f]{8,}'
if git grep -Iqn -E "$HOSTS_RE" HEAD -- "${EXCLUDES[@]}" 2>/dev/null; then
  fail "internal/pre-migration identifiers in tracked files:"
  git grep -In -E "$HOSTS_RE" HEAD -- "${EXCLUDES[@]}" | head -20
else
  pass "no internal identifiers"
fi

# 4. Personal identifiers (home directories, personal paths) ------------------
# Any user-specific home path is flagged; generic doc placeholders are allowed.
PERSONAL_RE='/Users/[A-Za-z][A-Za-z0-9._-]*|/home/[a-z][a-z0-9._-]*'
PERSONAL_ALLOW_RE='/home/(user|username|ubuntu|runner|example)([^a-z0-9._-]|$)'
PERSONAL_HITS=$(git grep -In -E "$PERSONAL_RE" HEAD -- "${EXCLUDES[@]}" 2>/dev/null \
  | grep -vE "$PERSONAL_ALLOW_RE" || true)
if [ -n "$PERSONAL_HITS" ]; then
  fail "personal paths in tracked files:"
  printf '%s\n' "$PERSONAL_HITS" | head -20
else
  pass "no personal paths"
fi

# 5. Links into docs/internal/ from tracked files -----------------------------
if git grep -Iqn 'docs/internal/' HEAD -- "${EXCLUDES[@]}" 2>/dev/null; then
  fail "tracked files link into docs/internal/:"
  git grep -In 'docs/internal/' HEAD -- "${EXCLUDES[@]}" | head -20
else
  pass "no docs/internal references"
fi

# 6. Private key material (belt-and-braces on top of gitleaks) ----------------
if git grep -Iqn -E 'BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY' HEAD 2>/dev/null; then
  fail "private key material in tracked files:"
  git grep -In -E 'BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY' HEAD | head -10
else
  pass "no private key material"
fi

# 7. Secrets — gitleaks over the published history ----------------------------
if [ "$SKIP_GITLEAKS" = 1 ]; then
  echo "skip: gitleaks (--skip-gitleaks)"
elif command -v gitleaks >/dev/null 2>&1; then
  if [ -n "$BASE" ]; then LOGOPTS="$BASE..HEAD"; else LOGOPTS="--all"; fi
  if gitleaks detect --source . --log-opts="$LOGOPTS" --no-banner --redact -v >/dev/null 2>&1; then
    pass "gitleaks clean ($LOGOPTS)"
  else
    fail "gitleaks found candidate secrets — run: gitleaks detect --source . --log-opts=\"$LOGOPTS\" --redact -v"
  fi
else
  fail "gitleaks not installed (use --skip-gitleaks to bypass locally)"
fi

exit $FAIL
