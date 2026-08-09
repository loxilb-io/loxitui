/** Individual parsed metric sample */
export interface ParsedMetric {
  name: string;
  help: string;
  type: string;
  labels: Record<string, string>;
  value: number;
  ts?: number;
}

/** Result of parsing a Prometheus text blob */
export interface ParseResult {
  metrics: ParsedMetric[];
  parseErrors: string[];
  rawSize: number;
}

/** Backward-compatible alias */
export type MetricSample = ParsedMetric;

/**
 * Build a unique key for a metric (name + sorted labels).
 */
export function metricKey(name: string, labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return name;
  const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(",");
  return `${name}{${labelStr}}`;
}

/**
 * Parse Prometheus text exposition format.
 * Handles # HELP / # TYPE comment lines, label sets, timestamps.
 * Skips malformed lines without throwing.
 */
export function parsePrometheusText(text: string): ParseResult {
  const metrics: ParsedMetric[] = [];
  const parseErrors: string[] = [];
  const helpMap = new Map<string, string>();
  const typeMap = new Map<string, string>();
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // # HELP metricName description text
    if (line.startsWith("# HELP ")) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx !== -1) {
        helpMap.set(rest.slice(0, spaceIdx), rest.slice(spaceIdx + 1));
      }
      continue;
    }

    // # TYPE metricName type
    if (line.startsWith("# TYPE ")) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx !== -1) {
        typeMap.set(rest.slice(0, spaceIdx), rest.slice(spaceIdx + 1));
      }
      continue;
    }

    // Skip other comments
    if (line.startsWith("#")) continue;

    // Parse metric line: name{labels} value [timestamp]
    const braceStart = line.indexOf("{");
    let name: string;
    let labelStr: string;
    let remainder: string;

    if (braceStart !== -1) {
      name = line.slice(0, braceStart);
      const braceEnd = line.indexOf("}", braceStart);
      if (braceEnd === -1) {
        parseErrors.push(`Unclosed brace: ${line}`);
        continue;
      }
      labelStr = line.slice(braceStart + 1, braceEnd);
      remainder = line.slice(braceEnd + 1).trim();
    } else {
      labelStr = "";
      // name value [timestamp]
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) {
        parseErrors.push(`No value found: ${line}`);
        continue;
      }
      name = line.slice(0, spaceIdx);
      remainder = line.slice(spaceIdx + 1).trim();
    }

    // remainder is "value [timestamp]"
    const parts = remainder.split(/\s+/);
    if (parts.length === 0 || parts[0] === "") {
      parseErrors.push(`No value found: ${line}`);
      continue;
    }

    const value = Number.parseFloat(parts[0]!);
    if (!Number.isFinite(value)) {
      parseErrors.push(`Non-finite value: ${line}`);
      continue;
    }

    let ts: number | undefined;
    if (parts.length > 1 && parts[1] !== "") {
      const parsed = Number.parseFloat(parts[1]!);
      if (Number.isFinite(parsed)) ts = parsed;
    }

    const labels = parseLabels(labelStr);

    metrics.push({
      name,
      help: helpMap.get(name) ?? "",
      type: typeMap.get(name) ?? "",
      labels,
      value,
      ts,
    });
  }

  return { metrics, parseErrors, rawSize: text.length };
}

/**
 * Backward-compatible wrapper — returns just samples array.
 */
export function parsePrometheus(text: string): ParsedMetric[] {
  return parsePrometheusText(text).metrics;
}

function parseLabels(raw: string): Record<string, string> {
  if (!raw) return {};
  const labels: Record<string, string> = {};
  const re = /(\w+)="([^"\\]*(\\.[^"\\]*)*)"/g;
  let m = re.exec(raw);
  while (m !== null) {
    labels[m[1]!] = (m[2] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    m = re.exec(raw);
  }
  return labels;
}
