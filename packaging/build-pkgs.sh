#!/usr/bin/env bash
# build-pkgs.sh — build loxitui .deb/.rpm packages and a binary tarball.
#
# Usage: packaging/build-pkgs.sh [--version vX.Y.Z[-rc.N]] [--arch amd64|arm64]
#                                [--formats deb,rpm,tarball] [--out dist]
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="" ARCH="amd64" FORMATS="deb,rpm,tarball" OUT="dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --arch)    ARCH="$2"; shift 2 ;;
    --formats) FORMATS="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$VERSION" ] || VERSION="$(git describe --tags --match 'v[0-9]*' 2>/dev/null || echo v0.0.0)"

# tag -> package version / revision:  v0.1.0 -> 0.1.0 / 1 ; v0.1.0-rc.1 -> 0.1.0 / 1~rc.1
core="${VERSION#v}"; pre=""
case "$core" in *-*) pre="${core#*-}"; core="${core%%-*}" ;; esac
export PKG_VERSION="$core" PKG_RELEASE="1${pre:+~$pre}" PKG_ARCH="$ARCH"

rm -rf packaging/.staging; mkdir -p packaging/.staging "$OUT"
GOOS=linux GOARCH="$ARCH" CGO_ENABLED=0 \
  go build -trimpath -ldflags "-X 'github.com/loxilb-io/loxitui/internal/version.Version=${VERSION}'" \
  -o packaging/.staging/loxitui ./cmd/loxitui

for f in ${FORMATS//,/ }; do
  case "$f" in
    deb|rpm) nfpm package --config packaging/nfpm.yaml --packager "$f" --target "$OUT/" ;;
    tarball) tar -C packaging/.staging -czf "$OUT/loxitui_${VERSION}_linux_${ARCH}.tar.gz" loxitui ;;
    *) echo "unknown format: $f" >&2; exit 2 ;;
  esac
done
ls -l "$OUT"
