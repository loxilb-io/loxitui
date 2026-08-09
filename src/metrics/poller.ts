import type { LoxilbApiClient } from "@/api/client";
import { parsePrometheusText } from "./parser";
import { MetricStore } from "./store";

export interface PollerOptions {
  /** Path to scrape (defaults to /metrics) */
  path?: string;
  /** Polling interval in ms (default 5000) */
  interval?: number;
}

export class MetricPoller {
  readonly store: MetricStore;
  lastError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly path: string;
  private readonly interval: number;
  private running = false;

  constructor(
    private readonly client: LoxilbApiClient | null,
    opts: PollerOptions = {}
  ) {
    this.store = new MetricStore();
    this.path = opts.path ?? "/metrics";
    this.interval = opts.interval ?? 5000;
  }

  /** Fetch metrics from the Prometheus endpoint, parse, and push to store. */
  async fetchAndStore(): Promise<void> {
    // Gracefully no-op if no client configured (US-014 contract)
    if (!this.client) {
      this.lastError = null;
      return;
    }

    try {
      const result = await this.client.getText(this.path);
      if (result.ok) {
        const parsed = parsePrometheusText(result.text);
        this.store.push(parsed.metrics);
        this.lastError = null;
      } else {
        this.lastError = result.error.message;
      }
    } catch (err: unknown) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  /** Backward-compatible alias for fetchAndStore(). */
  async pollOnce(): Promise<void> {
    return this.fetchAndStore();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.fetchAndStore();
    this.timer = setInterval(() => {
      void this.fetchAndStore();
    }, this.interval);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
