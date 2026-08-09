import type { ApiResult, LoxilbApiClient } from "./client";
import type { AuthUser, LoginResponse, MessageResponse, UpdateLicenseRequest } from "./models";

/** Seconds before JWT expiry at which a refresh login is triggered. */
const REFRESH_MARGIN_S = 60;

/** Decode the `exp` claim (unix seconds) from a JWT, or null if unreadable. */
export function jwtExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export class AuthApi {
  constructor(private readonly c: LoxilbApiClient) {}

  /** POST /auth/login — exchange username/password for a JWT. */
  async login(username: string, password: string): Promise<ApiResult<LoginResponse>> {
    return this.c.post<LoginResponse>("/auth/login", { username, password });
  }

  /** POST /auth/logout — invalidate the current token. */
  async logout(): Promise<ApiResult<MessageResponse>> {
    return this.c.post<MessageResponse>("/auth/logout");
  }

  /** POST /auth/token/upgrade — upgrade a manual token with a license key. */
  async tokenUpgrade(licenseKey: string): Promise<ApiResult<UpdateLicenseRequest>> {
    return this.c.post<UpdateLicenseRequest>("/auth/token/upgrade", { license_key: licenseKey });
  }

  /** GET /auth/users */
  async listUsers(): Promise<ApiResult<AuthUser[]>> {
    return this.c.get<AuthUser[]>("/auth/users");
  }
}

export type AuthMode = "none" | "static-token" | "jwt";

export interface AuthState {
  mode: AuthMode;
  username?: string;
  /** Unix seconds when the current JWT expires, if known. */
  expiresAt?: number;
  error?: string;
}

/**
 * Manages the client's bearer token: username/password → JWT exchange with
 * expiry-aware refresh, falling back to a statically configured token when no
 * credentials are given.
 */
export class AuthSession {
  private readonly auth: AuthApi;
  private state: AuthState;

  constructor(
    private readonly c: LoxilbApiClient,
    private readonly cfg: { token?: string; username?: string; password?: string }
  ) {
    this.auth = new AuthApi(c);
    this.state = {
      mode: cfg.username && cfg.password ? "jwt" : cfg.token ? "static-token" : "none",
      username: cfg.username || undefined,
    };
  }

  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Ensure a valid token is set on the client. In jwt mode, logs in on first
   * call and re-logs-in when the token is within the refresh margin of expiry.
   * In static-token mode this is a no-op (the constructor already set it).
   */
  async ensureFresh(): Promise<AuthState> {
    if (this.state.mode !== "jwt") return this.getState();
    const now = Math.floor(Date.now() / 1000);
    if (this.state.expiresAt && this.state.expiresAt - now > REFRESH_MARGIN_S) {
      return this.getState();
    }
    const r = await this.auth.login(this.cfg.username ?? "", this.cfg.password ?? "");
    if (!r.ok) {
      this.state.error = r.error.message;
      // Keep any previously working token; fall back to the static one if set.
      if (!this.state.expiresAt && this.cfg.token) this.c.setToken(this.cfg.token);
      return this.getState();
    }
    const token = r.data.token ?? "";
    if (!token) {
      this.state.error = "login returned no token";
      return this.getState();
    }
    this.c.setToken(token);
    this.state.error = undefined;
    this.state.expiresAt = jwtExpiry(token) ?? undefined;
    return this.getState();
  }

  /** POST /auth/logout and clear the client token (jwt mode only). */
  async logout(): Promise<void> {
    if (this.state.mode !== "jwt") return;
    await this.auth.logout();
    this.c.setToken(this.cfg.token ?? "");
    this.state.expiresAt = undefined;
  }
}
