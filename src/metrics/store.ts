import { type ParsedMetric, metricKey } from "./parser";

/** Backward-compatible alias */
export type MetricSample = ParsedMetric;

export interface MetricTimeline {
  name: string;
  labels: Record<string, string>;
  /** Most recent value at index [length-1] */
  history: number[];
  timestamps: Date[];
  latest: number;
  updatedAt: number;
}

type SubscribeCb = (key: string, value: number) => void;

export class MetricStore {
  private readonly timelines = new Map<string, MetricTimeline>();
  private readonly historyPoints: number;
  private readonly subscribers = new Map<string, Set<SubscribeCb>>();

  constructor(historyPoints = 60) {
    this.historyPoints = historyPoints;
  }

  /** Push a batch of parsed metrics into the store. */
  push(metrics: ParsedMetric[], timestamp?: Date): void {
    const ts = timestamp ?? new Date();
    const now = ts.getTime();
    for (const m of metrics) {
      const key = metricKey(m.name, m.labels);
      const existing = this.timelines.get(key);
      if (existing) {
        existing.history.push(m.value);
        existing.timestamps.push(ts);
        if (existing.history.length > this.historyPoints) {
          existing.history.shift();
          existing.timestamps.shift();
        }
        existing.latest = m.value;
        existing.updatedAt = now;
      } else {
        this.timelines.set(key, {
          name: m.name,
          labels: m.labels,
          history: [m.value],
          timestamps: [ts],
          latest: m.value,
          updatedAt: now,
        });
      }
      // Notify subscribers
      const subs = this.subscribers.get(key);
      if (subs) {
        for (const cb of subs) cb(key, m.value);
      }
    }
  }

  /** Backward-compatible alias for push(). */
  ingest(samples: ParsedMetric[]): void {
    this.push(samples);
  }

  /** Get time series data for a metric. */
  getSeries(
    name: string,
    labels?: Record<string, string>
  ): { timestamps: Date[]; values: number[] } | undefined {
    const tl = this.get(name, labels);
    if (!tl) return undefined;
    return { timestamps: [...tl.timestamps], values: [...tl.history] };
  }

  /** Get the latest value for a metric. */
  getLatest(name: string, labels?: Record<string, string>): number | undefined {
    return this.get(name, labels)?.latest;
  }

  /**
   * Compute per-second rate from counter delta over a time window.
   * Returns 0 if insufficient data points.
   */
  getRate(name: string, labels?: Record<string, string>, windowSec = 60): number {
    const tl = this.get(name, labels);
    if (!tl || tl.history.length < 2) return 0;

    const now = tl.timestamps[tl.timestamps.length - 1]!.getTime();
    const windowMs = windowSec * 1000;
    const cutoff = now - windowMs;

    // Find earliest point within window
    let startIdx = 0;
    for (let i = tl.timestamps.length - 1; i >= 0; i--) {
      if (tl.timestamps[i]!.getTime() <= cutoff) {
        startIdx = i;
        break;
      }
      startIdx = i;
    }

    const endIdx = tl.history.length - 1;
    if (startIdx === endIdx) return 0;

    const valueDelta = tl.history[endIdx]! - tl.history[startIdx]!;
    const timeDeltaMs = tl.timestamps[endIdx]!.getTime() - tl.timestamps[startIdx]!.getTime();
    if (timeDeltaMs <= 0) return 0;

    return valueDelta / (timeDeltaMs / 1000);
  }

  /** Subscribe to updates for a specific metric key. Returns unsubscribe function. */
  subscribe(key: string, cb: SubscribeCb): () => void {
    let subs = this.subscribers.get(key);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(key, subs);
    }
    subs.add(cb);
    return () => {
      subs!.delete(cb);
      if (subs!.size === 0) this.subscribers.delete(key);
    };
  }

  /** Clear all stored timelines and subscribers. */
  clear(): void {
    this.timelines.clear();
    this.subscribers.clear();
  }

  /** Look up a timeline by name and optional labels. */
  get(name: string, labels?: Record<string, string>): MetricTimeline | undefined {
    const key = metricKey(name, labels ?? {});
    return this.timelines.get(key);
  }

  /** List all unique metric names sorted alphabetically. */
  names(): string[] {
    return [...new Set([...this.timelines.values()].map((t) => t.name))].sort();
  }

  /** Return all timelines. */
  all(): MetricTimeline[] {
    return [...this.timelines.values()];
  }

  /** Filter timelines by name prefix. */
  byPrefix(prefix: string): MetricTimeline[] {
    return [...this.timelines.values()].filter((t) => t.name.startsWith(prefix));
  }
}
