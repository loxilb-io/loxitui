import { describe, expect, it } from "bun:test";
import { AuthSession, jwtExpiry } from "../src/api/auth";
import type { ApiResult, LoxilbApiClient } from "../src/api/client";

function makeJwt(exp?: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(exp !== undefined ? { exp } : {})).toString(
    "base64url"
  );
  return `${header}.${payload}.sig`;
}

/** Mock client capturing setToken calls and answering POST /auth/login. */
function mockClient(loginResult: ApiResult<unknown>): {
  client: LoxilbApiClient;
  tokens: string[];
  loginCalls: number[];
} {
  const tokens: string[] = [];
  const loginCalls: number[] = [];
  const client = {
    setToken: (t: string) => {
      tokens.push(t);
    },
    post: (path: string, _body?: unknown) => {
      if (path === "/auth/login") {
        loginCalls.push(Date.now());
        return Promise.resolve(loginResult);
      }
      return Promise.resolve({ ok: true, data: undefined });
    },
    get: () => Promise.resolve({ ok: true, data: undefined }),
    del: () => Promise.resolve({ ok: true, data: undefined }),
  } as unknown as LoxilbApiClient;
  return { client, tokens, loginCalls };
}

describe("jwtExpiry", () => {
  it("decodes the exp claim from a JWT", () => {
    expect(jwtExpiry(makeJwt(1234567890))).toBe(1234567890);
  });

  it("returns null when exp is absent", () => {
    expect(jwtExpiry(makeJwt())).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(jwtExpiry("not-a-jwt")).toBeNull();
    expect(jwtExpiry("a.b")).toBeNull();
    expect(jwtExpiry("a.%%%.c")).toBeNull();
  });
});

describe("AuthSession", () => {
  it("static-token mode: ensureFresh is a no-op and never logs in", async () => {
    const { client, loginCalls } = mockClient({ ok: true, data: { token: "x" } });
    const session = new AuthSession(client, { token: "static-abc" });
    const state = await session.ensureFresh();
    expect(state.mode).toBe("static-token");
    expect(loginCalls.length).toBe(0);
  });

  it("none mode when neither token nor credentials configured", () => {
    const { client } = mockClient({ ok: true, data: {} });
    const session = new AuthSession(client, {});
    expect(session.getState().mode).toBe("none");
  });

  it("jwt mode: logs in on first ensureFresh and sets the token", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt(exp);
    const { client, tokens, loginCalls } = mockClient({ ok: true, data: { token: jwt } });
    const session = new AuthSession(client, { username: "admin", password: "pw" });

    const state = await session.ensureFresh();
    expect(state.mode).toBe("jwt");
    expect(state.expiresAt).toBe(exp);
    expect(state.error).toBeUndefined();
    expect(tokens).toEqual([jwt]);
    expect(loginCalls.length).toBe(1);
  });

  it("jwt mode: does not re-login while the token is far from expiry", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const { client, loginCalls } = mockClient({ ok: true, data: { token: jwt } });
    const session = new AuthSession(client, { username: "admin", password: "pw" });

    await session.ensureFresh();
    await session.ensureFresh();
    await session.ensureFresh();
    expect(loginCalls.length).toBe(1);
  });

  it("jwt mode: re-logs-in when the token is inside the refresh margin", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 30); // < 60s margin
    const { client, loginCalls } = mockClient({ ok: true, data: { token: jwt } });
    const session = new AuthSession(client, { username: "admin", password: "pw" });

    await session.ensureFresh();
    await session.ensureFresh();
    expect(loginCalls.length).toBe(2);
  });

  it("jwt mode: records the error and falls back to the static token on login failure", async () => {
    const { client, tokens } = mockClient({
      ok: false,
      error: { status: 401, message: "bad credentials", url: "http://x/auth/login" },
    });
    const session = new AuthSession(client, {
      token: "fallback-token",
      username: "admin",
      password: "wrong",
    });

    const state = await session.ensureFresh();
    expect(state.mode).toBe("jwt");
    expect(state.error).toBe("bad credentials");
    expect(tokens).toEqual(["fallback-token"]);
  });

  it("jwt mode: reports an error when login returns no token", async () => {
    const { client } = mockClient({ ok: true, data: {} });
    const session = new AuthSession(client, { username: "admin", password: "pw" });
    const state = await session.ensureFresh();
    expect(state.error).toBe("login returned no token");
  });
});
