import { getAuditLogger } from "@/audit";

export interface ClientConfig {
  host: string;
  port: number;
  tls: boolean;
  token: string;
  /** Optional credentials for JWT login via POST /auth/login (token exchange). */
  username?: string;
  password?: string;
  timeout?: number;
}

export interface ApiError {
  status: number;
  message: string;
  url: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export class LoxilbApiClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(cfg: ClientConfig) {
    const scheme = cfg.tls ? "https" : "http";
    this.base = `${scheme}://${cfg.host}:${cfg.port}/netlox/v1`;
    this.timeout = cfg.timeout ?? 5_000;
    this.headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (cfg.token) {
      this.headers.Authorization = `Bearer ${cfg.token}`;
    }
  }

  getBase(): string {
    return this.base;
  }

  /** Replace the bearer token at runtime (e.g. after a JWT login or refresh). */
  setToken(token: string): void {
    if (token) {
      this.headers.Authorization = `Bearer ${token}`;
    } else {
      delete this.headers.Authorization;
    }
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<ApiResult<T>> {
    const url = `${this.base}${path}`;
    const t0 = Date.now();
    try {
      const resp = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!resp.ok) {
        let message = resp.statusText;
        try {
          const json = (await resp.json()) as { message?: string };
          message = json.message ?? message;
        } catch {
          // ignore JSON parse failure
        }
        getAuditLogger().log({
          event: "api.request",
          component: "api",
          ms: Date.now() - t0,
          data: { method, path: url.replace(this.base, ""), status: resp.status, error: message },
        });
        return { ok: false, error: { status: resp.status, message, url } };
      }

      if (resp.status === 204) {
        getAuditLogger().log({
          event: "api.request",
          component: "api",
          ms: Date.now() - t0,
          data: { method, path: url.replace(this.base, ""), status: 204 },
        });
        return { ok: true, data: undefined as T };
      }
      let data: T;
      try {
        data = (await resp.json()) as T;
      } catch {
        getAuditLogger().log({
          event: "api.request",
          component: "api",
          ms: Date.now() - t0,
          data: {
            method,
            path: url.replace(this.base, ""),
            status: resp.status,
            error: "Invalid JSON",
          },
        });
        return {
          ok: false,
          error: { status: resp.status, message: `Invalid JSON response from ${url}`, url },
        };
      }
      getAuditLogger().log({
        event: "api.request",
        component: "api",
        ms: Date.now() - t0,
        data: { method, path: url.replace(this.base, ""), status: resp.status },
      });
      return { ok: true, data };
    } catch (err: unknown) {
      const message = this.classifyError(err, url);
      getAuditLogger().log({
        event: "api.request",
        component: "api",
        ms: Date.now() - t0,
        data: { method, path: url.replace(this.base, ""), status: 0, error: message },
      });
      return { ok: false, error: { status: 0, message, url } };
    }
  }

  get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>("POST", path, body);
  }

  del<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>("DELETE", path, body);
  }

  /** Fetch raw text (used by Prometheus metrics endpoint) */
  async getText(
    path: string
  ): Promise<{ ok: true; text: string } | { ok: false; error: ApiError }> {
    const url = `${this.base}${path}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        // go-swagger rejects Accept: text/plain with 406 — the lifecycle
        // documents are JSON served as text, so negotiate JSON and return raw.
        headers: { ...this.headers, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!resp.ok) {
        return { ok: false, error: { status: resp.status, message: resp.statusText, url } };
      }
      const text = await resp.text();
      return { ok: true, text };
    } catch (err: unknown) {
      const message = this.classifyError(err, url);
      return { ok: false, error: { status: 0, message, url } };
    }
  }

  /** Classify a fetch error into a user-friendly message */
  private classifyError(err: unknown, url: string): string {
    if (err instanceof Error) {
      const name = err.name.toLowerCase();
      const msg = err.message.toLowerCase();
      if (
        name === "timeouterror" ||
        name === "aborterror" ||
        msg.includes("timeout") ||
        msg.includes("abort")
      ) {
        try {
          const parsed = new URL(url);
          return `Connection timed out to ${parsed.hostname}:${parsed.port}`;
        } catch {
          return `Connection timed out to ${url}`;
        }
      }
      return err.message;
    }
    return String(err);
  }
}
