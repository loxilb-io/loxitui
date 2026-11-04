#!/usr/bin/env bash
#
# coverage-gate.sh — enforce a minimum line-coverage floor on `bun test --coverage`.
#
# Ratchet model: the floor starts just below the measured baseline
# (62.86% lines at introduction) and only ever moves UP as coverage improves.
# Never lower it to make CI pass — add tests instead.
#
# Usage: scripts/coverage-gate.sh            (floor from COVERAGE_FLOOR, default 60)
#        COVERAGE_FLOOR=65 scripts/coverage-gate.sh
set -uo pipefail

FLOOR="${COVERAGE_FLOOR:-60}"

out=$(bun test --coverage 2>&1)
status=$?
if [ $status -ne 0 ]; then
  printf '%s\n' "$out"
  echo "FAIL: test suite failed (exit $status)"
  exit "$status"
fi

# Coverage table row: "All files | <% Funcs> | <% Lines> |"
pct=$(printf '%s\n' "$out" | awk -F'|' '/^All files/ {gsub(/ /,"",$3); print $3; exit}')

if [ -z "$pct" ]; then
  printf '%s\n' "$out" | tail -30
  echo "FAIL: could not parse coverage output (no 'All files' row)"
  exit 1
fi

echo "line coverage: ${pct}% (floor: ${FLOOR}%)"
awk -v p="$pct" -v f="$FLOOR" 'BEGIN { exit (p+0 >= f+0) ? 0 : 1 }' || {
  echo "FAIL: line coverage ${pct}% is below the ${FLOOR}% floor"
  exit 1
}
echo "ok: coverage floor met"
