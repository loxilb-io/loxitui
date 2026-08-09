import { describe, expect, it } from "bun:test";
import {
  type ParsedMetric,
  metricKey,
  parsePrometheus,
  parsePrometheusText,
} from "../src/metrics/parser";
import { fmtValue, renderMultiLine, renderSparkline, sparkline } from "../src/metrics/sparkline";
import { MetricStore } from "../src/metrics/store";

// Mixed camelCase (LoxiLB standard) and snake_case (loxilb_ai_*) metric names
const SAMPLE_PROM = `# HELP activeConntrackCount Active conntrack entries
# TYPE activeConntrackCount gauge
activeConntrackCount{instance="default"} 42
# HELP systemCPUUtilization System CPU utilization
# TYPE systemCPUUtilization gauge
systemCPUUtilization 0.75
# HELP loxilb_ai_tokens_total Total AI tokens processed
# TYPE loxilb_ai_tokens_total counter
loxilb_ai_tokens_total{tenant="acme",model="gpt-4"} 98765
loxilb_bytes_total 1234567
loxilb_multi_label{job="lb",env="prod"} 3.14
`;

describe("parsePrometheusText", () => {
  it("returns ParseResult with metrics, parseErrors, rawSize", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    expect(result.metrics.length).toBe(5);
    expect(result.rawSize).toBe(SAMPLE_PROM.length);
    expect(Array.isArray(result.parseErrors)).toBe(true);
  });

  it("parses camelCase metric names (LoxiLB style)", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    const cpu = result.metrics.find((m) => m.name === "systemCPUUtilization");
    expect(cpu).toBeDefined();
    expect(cpu!.value).toBe(0.75);
    expect(cpu!.type).toBe("gauge");
    expect(cpu!.help).toBe("System CPU utilization");
  });

  it("parses snake_case loxilb_ai_* metrics", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    const ai = result.metrics.find((m) => m.name === "loxilb_ai_tokens_total");
    expect(ai).toBeDefined();
    expect(ai!.value).toBe(98765);
    expect(ai!.labels.tenant).toBe("acme");
    expect(ai!.labels.model).toBe("gpt-4");
    expect(ai!.type).toBe("counter");
    expect(ai!.help).toBe("Total AI tokens processed");
  });

  it("parses labels and values correctly", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    const conn = result.metrics.find((m) => m.name === "activeConntrackCount");
    expect(conn).toBeDefined();
    expect(conn!.labels.instance).toBe("default");
    expect(conn!.value).toBe(42);
    expect(conn!.help).toBe("Active conntrack entries");
  });

  it("parses bare metric without labels", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    const bytes = result.metrics.find((m) => m.name === "loxilb_bytes_total");
    expect(bytes).toBeDefined();
    expect(bytes!.value).toBe(1234567);
    expect(Object.keys(bytes!.labels)).toHaveLength(0);
  });

  it("parses multi-label metric", () => {
    const result = parsePrometheusText(SAMPLE_PROM);
    const ml = result.metrics.find((m) => m.name === "loxilb_multi_label");
    expect(ml!.labels.job).toBe("lb");
    expect(ml!.labels.env).toBe("prod");
    expect(ml!.value).toBeCloseTo(3.14);
  });

  it("skips comment and empty lines", () => {
    const result = parsePrometheusText("# comment\n\n   \nfoo 1");
    expect(result.metrics.length).toBe(1);
    expect(result.metrics[0]?.name).toBe("foo");
  });

  it("records parse errors for malformed lines", () => {
    const result = parsePrometheusText("good_metric 42\nbad_metric_no_value\nok 7");
    expect(result.metrics.length).toBe(2);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  it("handles metric with timestamp", () => {
    const result = parsePrometheusText('metric_with_ts{env="dev"} 99.5 1609459200');
    expect(result.metrics[0]!.value).toBe(99.5);
    expect(result.metrics[0]!.ts).toBe(1609459200);
  });
});

describe("parsePrometheus (backward compat)", () => {
  it("returns array of ParsedMetric", () => {
    const samples = parsePrometheus(SAMPLE_PROM);
    expect(samples.length).toBe(5);
    expect(samples[0]!.name).toBe("activeConntrackCount");
  });
});

describe("metricKey", () => {
  it("builds key without labels", () => {
    expect(metricKey("foo", {})).toBe("foo");
  });

  it("builds key with sorted labels", () => {
    expect(metricKey("m", { z: "1", a: "2" })).toBe('m{a="2",z="1"}');
  });
});

describe("MetricStore", () => {
  it("tracks history up to default 60 points", () => {
    const store = new MetricStore();
    for (let i = 0; i <= 70; i++) {
      store.push([{ name: "foo", labels: {}, value: i, help: "", type: "" }]);
    }
    const tl = store.get("foo");
    expect(tl?.history.length).toBeLessThanOrEqual(60);
    expect(tl?.latest).toBe(70);
  });

  it("evicts oldest entry when ring buffer is full", () => {
    const store = new MetricStore(5);
    for (let i = 1; i <= 7; i++) {
      store.push([{ name: "x", labels: {}, value: i, help: "", type: "" }]);
    }
    const series = store.getSeries("x");
    expect(series).toBeDefined();
    expect(series!.values).toEqual([3, 4, 5, 6, 7]);
    expect(series!.values.length).toBe(5);
  });

  it("returns undefined for unknown metric", () => {
    const store = new MetricStore();
    expect(store.get("nope")).toBeUndefined();
    expect(store.getLatest("nope")).toBeUndefined();
    expect(store.getSeries("nope")).toBeUndefined();
  });

  it("getLatest returns most recent value", () => {
    const store = new MetricStore();
    store.push([{ name: "m", labels: {}, value: 10, help: "", type: "" }]);
    store.push([{ name: "m", labels: {}, value: 20, help: "", type: "" }]);
    expect(store.getLatest("m")).toBe(20);
  });

  it("getSeries returns timestamps and values", () => {
    const store = new MetricStore();
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:00:05Z");
    store.push([{ name: "s", labels: {}, value: 1, help: "", type: "" }], t1);
    store.push([{ name: "s", labels: {}, value: 2, help: "", type: "" }], t2);
    const series = store.getSeries("s");
    expect(series!.values).toEqual([1, 2]);
    expect(series!.timestamps.length).toBe(2);
  });

  it("getRate computes per-second rate", () => {
    const store = new MetricStore();
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:00:10Z");
    store.push([{ name: "c", labels: {}, value: 100, help: "", type: "" }], t1);
    store.push([{ name: "c", labels: {}, value: 200, help: "", type: "" }], t2);
    // 100 value increase over 10 seconds = 10/s
    expect(store.getRate("c")).toBe(10);
  });

  it("getRate returns 0 for single data point", () => {
    const store = new MetricStore();
    store.push([{ name: "c", labels: {}, value: 100, help: "", type: "" }]);
    expect(store.getRate("c")).toBe(0);
  });

  it("subscribe notifies on updates", () => {
    const store = new MetricStore();
    const received: number[] = [];
    const unsub = store.subscribe("metric", (_, val) => received.push(val));
    store.push([{ name: "metric", labels: {}, value: 42, help: "", type: "" }]);
    store.push([{ name: "metric", labels: {}, value: 99, help: "", type: "" }]);
    expect(received).toEqual([42, 99]);
    unsub();
    store.push([{ name: "metric", labels: {}, value: 0, help: "", type: "" }]);
    expect(received).toEqual([42, 99]); // no more notifications
  });

  it("clear removes all data", () => {
    const store = new MetricStore();
    store.push([{ name: "a", labels: {}, value: 1, help: "", type: "" }]);
    store.clear();
    expect(store.all()).toHaveLength(0);
    expect(store.get("a")).toBeUndefined();
  });

  it("ingest backward compat works", () => {
    const store = new MetricStore();
    store.ingest([{ name: "foo", labels: {}, value: 5, help: "", type: "" }]);
    expect(store.getLatest("foo")).toBe(5);
  });
});

describe("renderSparkline", () => {
  it("renders correct width (default 20)", () => {
    const s = renderSparkline([1, 2, 3, 4, 5]);
    expect(s.length).toBe(20);
  });

  it("renders custom width", () => {
    const s = renderSparkline([1, 2, 3, 4, 5], 10);
    expect(s.length).toBe(10);
  });

  it("handles empty array", () => {
    const s = renderSparkline([], 5);
    expect(s.length).toBe(5);
    expect(s).toBe("▁▁▁▁▁");
  });

  it("handles all-zero array", () => {
    const s = renderSparkline([0, 0, 0], 3);
    expect(s.length).toBe(3);
  });

  it("pads short values", () => {
    const s = renderSparkline([1], 8);
    expect(s.length).toBe(8);
  });
});

describe("sparkline (backward compat)", () => {
  it("renders correct width (default 10)", () => {
    const s = sparkline([1, 2, 3, 4, 5], 5);
    expect(s.length).toBe(5);
  });

  it("pads short history", () => {
    const s = sparkline([1], 8);
    expect(s.length).toBe(8);
  });
});

describe("renderMultiLine", () => {
  it("returns labeled sparkline rows", () => {
    const lines = renderMultiLine(
      [
        { label: "cpu", values: [10, 20, 30] },
        { label: "mem", values: [50, 60, 70] },
      ],
      5
    );
    expect(lines.length).toBe(2);
    expect(lines[0]!).toContain("cpu");
    expect(lines[1]!).toContain("mem");
  });

  it("returns empty array for empty series", () => {
    expect(renderMultiLine([])).toEqual([]);
  });

  it("respects height limit", () => {
    const lines = renderMultiLine(
      [
        { label: "a", values: [1] },
        { label: "b", values: [2] },
        { label: "c", values: [3] },
      ],
      5,
      2
    );
    expect(lines.length).toBe(2);
  });
});

describe("fmtValue", () => {
  it("formats gigabytes", () => {
    expect(fmtValue(2_000_000_000)).toBe("2.0G");
  });
  it("formats megabytes", () => {
    expect(fmtValue(1_500_000)).toBe("1.5M");
  });
  it("formats kilobytes", () => {
    expect(fmtValue(1200)).toBe("1.2k");
  });
  it("formats small values", () => {
    expect(fmtValue(42)).toBe("42");
  });
});
