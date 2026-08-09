/**
 * Shared helpers for live-gateway E2E tests.
 *
 * The suite is opt-in: it runs only when LOXITUI_E2E_HOST is set, so
 * `bun test` stays hermetic by default. Point it at any reachable
 * loxilb-inference-gateway instance:
 *
 *   LOXITUI_E2E_HOST=127.0.0.1 bun test tests/e2e
 *
 * Optional: LOXITUI_E2E_PORT (default 11111), LOXITUI_E2E_TOKEN,
 * LOXITUI_E2E_TLS=1.
 */

import { LoxilbApi } from "@/api/index.js";

export const E2E_HOST = process.env.LOXITUI_E2E_HOST ?? "";
export const E2E_PORT = Number(process.env.LOXITUI_E2E_PORT ?? 11111);
export const e2eEnabled = E2E_HOST.length > 0;

export function makeApi(): LoxilbApi {
  return new LoxilbApi({
    host: E2E_HOST,
    port: E2E_PORT,
    tls: process.env.LOXITUI_E2E_TLS === "1",
    token: process.env.LOXITUI_E2E_TOKEN ?? "",
    timeout: 10_000,
  });
}

/**
 * How long to wait for the gateway to serve its first request. A cold
 * container loads the eBPF/TC data plane before the REST API comes up, which
 * can take tens of seconds on a CI runner; overridable for slow environments.
 */
export const GATEWAY_READY_TIMEOUT_MS = Number(
  process.env.LOXITUI_E2E_READY_TIMEOUT_MS ?? 90_000
);

/** Poll GET /version until the gateway answers (fresh containers take a while). */
export async function waitForGateway(
  api: LoxilbApi,
  timeoutMs = GATEWAY_READY_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";
  while (Date.now() < deadline) {
    const r = await api.status.version();
    if (r.ok) return;
    lastError = r.error.message;
    await new Promise((res) => setTimeout(res, 2_000));
  }
  throw new Error(
    `gateway at ${E2E_HOST}:${E2E_PORT} not ready after ${timeoutMs}ms: ${lastError}`
  );
}

/**
 * Addresses reserved for E2E fixtures. Anything created by the suite uses
 * this prefix so leaked resources are identifiable and cleanup can sweep them.
 */
export const E2E_VIP = "192.0.2.210"; // TEST-NET-1, never routable
export const E2E_EP_IP = "192.0.2.211";
export const E2E_CIDR = "192.0.2.0/28";
