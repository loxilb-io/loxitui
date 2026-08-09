#!/usr/bin/env bash
#
# e2e-testbed.sh — run the full practical test cycle against a remote testbed.
#
# What it does:
#   1. Ensures a loxilb-inference-gateway container is running on the testbed.
#   2. Cross-compiles the linux-x64 loxitui binary, ships it to the testbed,
#      and drives the real CLI there: version, yaml init/validate/diff/apply,
#      verifying the applied rule through the gateway API (remote CLI smoke).
#   3. Opens an SSH tunnel and runs the local E2E suite (tests/e2e) against
#      the same gateway (API/adapter/reconciler coverage).
#
# Authentication is the caller's problem by design — use ssh-agent, an
# ~/.ssh/config entry, or `SSHPASS=... SSH_CMD="sshpass -e ssh"`. No
# credentials live in this script or in CI logs.
#
# Usage:
#   TESTBED_HOST=192.0.2.10 TESTBED_USER=<user> scripts/e2e-testbed.sh
#
# Environment:
#   TESTBED_HOST     (required) testbed address
#   TESTBED_USER     (required) ssh user
#   SSH_CMD          ssh command (default: ssh). e.g. "sshpass -e ssh"
#   SCP_CMD          scp command (default: scp). e.g. "sshpass -e scp"
#   GATEWAY_IMAGE    gateway image (default: ghcr.io/loxilb-io/loxilb-inference-gateway:latest-u24)
#   GATEWAY_NAME     container name (default: loxitui-e2e-gw)
#   TUNNEL_PORT      local tunnel port (default: 21111)
#   SKIP_REMOTE_CLI  set to 1 to skip the remote CLI smoke (tunnel tests only)
set -euo pipefail

cd "$(dirname "$0")/.."

: "${TESTBED_HOST:?TESTBED_HOST is required}"
: "${TESTBED_USER:?TESTBED_USER is required}"
SSH_CMD=${SSH_CMD:-ssh}
SCP_CMD=${SCP_CMD:-scp}
GATEWAY_IMAGE=${GATEWAY_IMAGE:-ghcr.io/loxilb-io/loxilb-inference-gateway:latest-u24}
GATEWAY_NAME=${GATEWAY_NAME:-loxitui-e2e-gw}
TUNNEL_PORT=${TUNNEL_PORT:-21111}
TARGET="$TESTBED_USER@$TESTBED_HOST"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

remote() { $SSH_CMD "${SSH_OPTS[@]}" "$TARGET" "$@"; }

step() { printf '\n\033[1;34m── %s\033[0m\n' "$*"; }

# ── 1. Gateway container up ────────────────────────────────────────────────
step "Ensure gateway container '$GATEWAY_NAME' is running on $TESTBED_HOST"
remote "docker inspect -f '{{.State.Running}}' $GATEWAY_NAME 2>/dev/null | grep -q true \
  || docker run --privileged -d --name $GATEWAY_NAME -p 11111:11111 $GATEWAY_IMAGE"

step "Wait for gateway API"
remote 'for i in $(seq 1 30); do
  curl -s -m 3 http://127.0.0.1:11111/netlox/v1/version && exit 0; sleep 2; done
  echo "gateway did not come up" >&2; exit 1'

# ── 2. Remote CLI smoke ────────────────────────────────────────────────────
if [[ "${SKIP_REMOTE_CLI:-0}" != "1" ]]; then
  step "Build linux-x64 binary"
  ./scripts/fetch-platform-deps.sh core-linux-x64
  bun run build:linux-x64

  step "Ship binary to testbed"
  $SCP_CMD "${SSH_OPTS[@]}" dist/loxitui-linux-x64 "$TARGET:/tmp/loxitui"

  step "Remote CLI smoke: version / yaml init / validate / diff / apply"
  remote 'set -euo pipefail
    chmod +x /tmp/loxitui
    /tmp/loxitui version
    WORK=$(mktemp -d)
    trap "rm -rf $WORK" EXIT
    /tmp/loxitui yaml init "$WORK/cfg" >/dev/null
    cat > "$WORK/cfg/core/e2e-lb.yaml" <<EOF
apiVersion: loxilb.io/v1
kind: LoadBalancer
metadata:
  name: e2e-cli-lb
spec:
  serviceArguments:
    externalIP: 192.0.2.220
    port: 8081
    protocol: tcp
    sel: rr
    mode: dnat
  endpoints:
    - endpointIP: 192.0.2.221
      targetPort: 5001
      weight: 1
EOF
    /tmp/loxitui yaml validate "$WORK/cfg/core/e2e-lb.yaml"
    # yaml diff has git-diff exit semantics: 1 = changes present (expected here)
    rc=0; /tmp/loxitui yaml diff "$WORK/cfg/core/e2e-lb.yaml" || rc=$?
    [ "$rc" -le 1 ] || { echo "yaml diff failed with rc=$rc" >&2; exit "$rc"; }
    /tmp/loxitui yaml apply "$WORK/cfg/core/e2e-lb.yaml" --yes
    # the applied rule must be visible through the raw API
    curl -s -m 5 http://127.0.0.1:11111/netlox/v1/config/loadbalancer/all | grep -q "192.0.2.220"
    echo "APPLY-VERIFIED"
    # cleanup: delete the rule via the spec delete path
    curl -s -m 5 -X DELETE "http://127.0.0.1:11111/netlox/v1/config/loadbalancer/externalipaddress/192.0.2.220/port/8081/protocol/tcp" >/dev/null
    curl -s -m 5 http://127.0.0.1:11111/netlox/v1/config/loadbalancer/all | grep -q "192.0.2.220" && { echo "CLEANUP-FAILED" >&2; exit 1; }
    echo "REMOTE-CLI-SMOKE-OK"'
fi

# ── 3. Local E2E suite through SSH tunnel ──────────────────────────────────
step "Open tunnel localhost:$TUNNEL_PORT → testbed:11111 and run tests/e2e"
CTRL=$(mktemp -u /tmp/loxitui-e2e-ctrl.XXXXXX)
$SSH_CMD "${SSH_OPTS[@]}" -f -N -M -S "$CTRL" -o ExitOnForwardFailure=yes \
  -L "$TUNNEL_PORT:127.0.0.1:11111" "$TARGET"
trap '$SSH_CMD -S "$CTRL" -O exit "$TARGET" 2>/dev/null || true' EXIT

LOXITUI_E2E_HOST=127.0.0.1 LOXITUI_E2E_PORT="$TUNNEL_PORT" bun test tests/e2e

step "All testbed E2E stages passed"
