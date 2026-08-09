const SPARKLINE_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Render a sparkline from numeric values using Unicode block characters.
 * @param values Array of values (oldest first, newest last)
 * @param width  Number of characters to render (default 20)
 */
export function renderSparkline(values: number[], width = 20): string {
  if (values.length === 0) return "▁".repeat(width);

  const slice = values.slice(-width);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;

  const chars = slice.map((v) => {
    const normalized = (v - min) / range;
    const idx = Math.min(
      SPARKLINE_CHARS.length - 1,
      Math.floor(normalized * SPARKLINE_CHARS.length)
    );
    return SPARKLINE_CHARS[idx]!;
  });

  // Pad left if shorter than requested width
  while (chars.length < width) chars.unshift("▁");

  return chars.join("");
}

/** Backward-compatible alias for renderSparkline with old default width. */
export function sparkline(history: number[], width = 10): string {
  return renderSparkline(history, width);
}

/**
 * Render a multi-series ASCII chart as an array of terminal lines.
 * Each series gets a labeled row with its sparkline.
 * @param series Array of {label, values} for each line
 * @param width  Sparkline width (default 20)
 * @param height Maximum number of lines (default: series.length)
 */
export function renderMultiLine(
  series: { label: string; values: number[] }[],
  width = 20,
  height?: number
): string[] {
  if (series.length === 0) return [];

  const maxLines = height ?? series.length;
  const visible = series.slice(0, maxLines);

  // Find longest label for alignment
  const maxLabelLen = Math.max(...visible.map((s) => s.label.length));

  return visible.map((s) => {
    const paddedLabel = s.label.padEnd(maxLabelLen);
    const line = renderSparkline(s.values, width);
    const latest = s.values.length > 0 ? s.values[s.values.length - 1]! : 0;
    return `${paddedLabel} ${line} ${fmtValue(latest)}`;
  });
}

/** Format a metric value with SI suffix (k, M, G) */
export function fmtValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}G`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(v < 1 ? 3 : 0);
}
