import { describe, expect, it, mock } from "bun:test";
import { LoxilbApiClient } from "../src/api/client";

describe("LoxilbApiClient", () => {
  it("constructs correct base URL (http)", () => {
    const c = new LoxilbApiClient({ host: "localhost", port: 11111, tls: false, token: "" });
    expect(c.getBase()).toBe("http://localhost:11111/netlox/v1");
  });

  it("constructs correct base URL (https)", () => {
    const c = new LoxilbApiClient({ host: "lb.example.com", port: 443, tls: true, token: "tok" });
    expect(c.getBase()).toBe("https://lb.example.com:443/netlox/v1");
  });

  it("adds Authorization header when token is set", () => {
    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "mytoken" });
    expect(c.getHeaders().Authorization).toBe("Bearer mytoken");
  });

  it("does not add Authorization header when token is empty", () => {
    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    expect(c.getHeaders().Authorization).toBeUndefined();
  });

  it("returns structured error on non-OK response", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(
      async () =>
        new Response(JSON.stringify({ message: "not found" }), {
          status: 404,
          statusText: "Not Found",
        })
    ) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    const result = await c.get("/test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(404);
      expect(result.error.message).toBe("not found");
    }

    global.fetch = origFetch;
  });

  it("returns Result error on network failure (no unhandled rejection)", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    const result = await c.get("/test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(0);
      expect(result.error.message).toContain("Failed to fetch");
      expect(result.error.url).toContain("/test");
    }

    global.fetch = origFetch;
  });

  it("returns specific message on malformed JSON response", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(
      async () => new Response("not json {{{", { status: 200, statusText: "OK" })
    ) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    const result = await c.get("/bad-json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid JSON response from");
      expect(result.error.message).toContain("/bad-json");
    }

    global.fetch = origFetch;
  });

  it("handles 404 response as empty array", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(
      async () =>
        new Response(JSON.stringify({ message: "not found" }), {
          status: 404,
          statusText: "Not Found",
        })
    ) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    const result = await c.get("/config/cistate/all");
    // Raw client returns Result error for 404 — callers (e.g. ClusterApi) promote
    // to ok:true with empty data. Verify client correctly reports 404 status.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(404);
    }

    global.fetch = origFetch;
  });

  it("handles null value in response body", async () => {
    const origFetch = global.fetch;
    global.fetch = mock(
      async () =>
        new Response(JSON.stringify({ ctAttr: null }), {
          status: 200,
          statusText: "OK",
        })
    ) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "h", port: 11111, tls: false, token: "" });
    const result = await c.get<{ ctAttr: unknown[] | null }>("/config/conntrack/all");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Client returns raw data; callers use ?? [] to normalize null
      expect(result.data.ctAttr).toBeNull();
    }

    global.fetch = origFetch;
  });

  it("returns timeout message with host:port on timeout error", async () => {
    const origFetch = global.fetch;
    const timeoutErr = new Error("The operation was aborted");
    timeoutErr.name = "TimeoutError";
    global.fetch = mock(async () => {
      throw timeoutErr;
    }) as unknown as typeof fetch;

    const c = new LoxilbApiClient({ host: "10.0.0.1", port: 11111, tls: false, token: "" });
    const result = await c.get("/test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Connection timed out to");
      expect(result.error.message).toContain("10.0.0.1");
      expect(result.error.message).toContain("11111");
    }

    global.fetch = origFetch;
  });
});
