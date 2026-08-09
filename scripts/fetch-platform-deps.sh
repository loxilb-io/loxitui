#!/usr/bin/env bash
#
# fetch-platform-deps.sh — materialize @opentui platform packages for
# cross-compilation.
#
# `bun build --compile --target=bun-<os>-<arch>` bundles the target
# platform's @opentui/core-<os>-<arch> package, but `bun install` skips
# packages whose os/cpu fields don't match the host — so cross-builds fail
# on a fresh checkout. This script downloads the missing platform packages
# straight from the npm registry (no install scripts run) and unpacks them
# into node_modules so the bundler can resolve them.
#
# Needs only bun + tar (works in the oven/bun container, which has no npm).
#
# Usage: scripts/fetch-platform-deps.sh [pkg ...]
#   no args: fetch all four platform packages (CI release build)
#   args:    fetch only the named ones, e.g. core-linux-arm64 (Dockerfile)
set -euo pipefail

cd "$(dirname "$0")/.."

# Single source of truth: the exact pin in package.json.
VERSION=$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).dependencies["@opentui/core-linux-x64"])')

PKGS=("$@")
if [ ${#PKGS[@]} -eq 0 ]; then
  PKGS=(core-linux-x64 core-linux-arm64 core-darwin-x64 core-darwin-arm64)
fi

for pkg in "${PKGS[@]}"; do
  dest="node_modules/@opentui/$pkg"
  if [ -d "$dest" ]; then
    echo "ok:   @opentui/$pkg already present"
    continue
  fi
  url="https://registry.npmjs.org/@opentui/$pkg/-/$pkg-$VERSION.tgz"
  echo "fetch: $url"
  bun -e 'const r = await fetch(process.argv[1]); if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); } await Bun.write(process.argv[2], r);' "$url" "/tmp/$pkg.tgz"
  mkdir -p "$dest"
  tar -xzf "/tmp/$pkg.tgz" --strip-components=1 -C "$dest"
  rm -f "/tmp/$pkg.tgz"
done
echo "done: requested @opentui platform packages available"
