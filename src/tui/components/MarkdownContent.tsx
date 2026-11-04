/**
 * MarkdownContent — renders a subset of Markdown as styled TUI elements.
 *
 * Supported syntax:
 *   Block: # / ## / ### / #### headings, ``` code fences, > blockquotes, tables,
 *          - / * / + unordered lists, - [ ] task lists, 1. ordered lists, --- hr, blank lines
 *   Inline: **bold**, *italic*, `code`, ~~strike~~, [link](url), plain text
 *
 * opentui has no font-weight/style attrs — emphasis is conveyed via colour only.
 *
 * IMPORTANT opentui constraint: <text> children must be strings or <span> only.
 * Never nest <text> or <box> inside <text>.
 */
import type { ReactNode } from "react";
import { colors } from "../theme";

// ── Inline parser ─────────────────────────────────────────────────────────────

type InlineToken = { kind: "bold" | "italic" | "code" | "strike" | "link" | "plain"; text: string };

function parseInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Groups: 1=boldMark 2=boldText  3=italicMark 4=italicText  5=codeText
  //         6=strikeText  7=linkText
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|~~(.+?)~~|\[([^\]]+)\]\([^)]+\)/g;
  let last = 0;
  let match = re.exec(line);

  while (match !== null) {
    if (match.index > last) {
      tokens.push({ kind: "plain", text: line.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      // **bold** or __bold__
      tokens.push({ kind: "bold", text: match[2] });
    } else if (match[3] !== undefined) {
      // *italic* or _italic_
      tokens.push({ kind: "italic", text: match[4] });
    } else if (match[5] !== undefined) {
      // `code`
      tokens.push({ kind: "code", text: match[5] });
    } else if (match[6] !== undefined) {
      // ~~strikethrough~~
      tokens.push({ kind: "strike", text: match[6] });
    } else {
      // [link text](url) — render display text only, url not shown in TUI
      tokens.push({ kind: "link", text: match[7] });
    }
    last = match.index + match[0].length;
    match = re.exec(line);
  }

  if (last < line.length) {
    tokens.push({ kind: "plain", text: line.slice(last) });
  }

  return tokens;
}

function tokenFg(kind: InlineToken["kind"], defaultFg: string): string {
  switch (kind) {
    case "bold":
      return "#ffffff"; // pure white — visually brighter than default #e6edf3
    case "italic":
      return colors.fg.secondary; // muted grey
    case "code":
      return colors.accent.tertiary; // orange
    case "strike":
      return colors.fg.muted; // dimmed — "crossed out"
    case "link":
      return colors.accent.primary; // blue — conventional link colour
    default:
      return defaultFg;
  }
}

/**
 * Returns an array of <span> elements (safe to use as <text> children).
 * Never returns a <text> or <box> — callers must wrap in <text> themselves.
 */
function inlineSpans(line: string, defaultFg: string, keyPrefix: string): ReactNode[] {
  const tokens = parseInline(line);
  if (tokens.length === 0)
    return [
      <span key={`${keyPrefix}-0`} fg={defaultFg}>
        {" "}
      </span>,
    ];
  return tokens.map((tok, i) => (
    <span key={`${keyPrefix}-${i}`} fg={tokenFg(tok.kind, defaultFg)}>
      {tok.text}
    </span>
  ));
}

// ── Display-width helpers (handles emoji & CJK wide chars) ──────────────────

/** Returns the terminal column width of a single Unicode code point. */
function cpWidth(cp: number): number {
  if (cp < 0x20) return 0; // control chars
  if (cp < 0x80) return 1; // ASCII fast path
  // Combining / zero-width
  if (cp <= 0x036f) return 0;
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) return 0;
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // variation selectors
  // Wide: CJK, Hangul, Fullwidth
  if (cp >= 0x1100 && cp <= 0x115f) return 2;
  if (cp >= 0x2e80 && cp <= 0x303e) return 2;
  if (cp >= 0x3040 && cp <= 0x33ff) return 2;
  if (cp >= 0x3400 && cp <= 0x4dbf) return 2;
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  if (cp >= 0xa000 && cp <= 0xa4cf) return 2;
  if (cp >= 0xac00 && cp <= 0xd7af) return 2;
  if (cp >= 0xf900 && cp <= 0xfaff) return 2;
  if (cp >= 0xfe10 && cp <= 0xfe1f) return 2;
  if (cp >= 0xfe30 && cp <= 0xfe4f) return 2;
  if (cp >= 0xff01 && cp <= 0xff60) return 2;
  if (cp >= 0xffe0 && cp <= 0xffe6) return 2;
  // Emoji & misc symbols
  if (cp >= 0x2600 && cp <= 0x27bf) return 2; // Misc symbols (✅ ⚠ ★ etc.)
  if (cp >= 0x2b50 && cp <= 0x2bff) return 2;
  if (cp >= 0x1f000 && cp <= 0x1ffff) return 2; // Emoji pictographs (🔵 💡 etc.)
  return 1;
}

/** Returns the terminal display width of a string (sum of code-point widths). */
function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) w += cpWidth(ch.codePointAt(0) ?? 0);
  return w;
}

/**
 * Fits a string into exactly `targetWidth` terminal columns:
 * truncates wide content and right-pads with spaces as needed.
 */
function fitToWidth(str: string, targetWidth: number): string {
  let used = 0;
  let result = "";
  for (const ch of str) {
    const cw = cpWidth(ch.codePointAt(0) ?? 0);
    if (used + cw > targetWidth) break;
    result += ch;
    used += cw;
  }
  if (used < targetWidth) result += " ".repeat(targetWidth - used);
  return result;
}

// ── Table helpers ─────────────────────────────────────────────────────────────

/** True if the line looks like a markdown table row: starts with optional spaces then | */
function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

/** Split a `| a | b |` row into trimmed cell strings */
function parseTableRow(line: string): string[] {
  const cells = line.split("|").map((c) => c.trim());
  if (cells[0] === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/** True if every cell is a GFM separator like `---`, `:---:`, etc. */
function isSepRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/**
 * Strip inline markdown markers to get the plain display text (used for width calc).
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/**
 * Render accumulated table lines as a bordered, column-aligned layout.
 * Cells support inline markdown (bold, italic, code).
 */
function renderTable(tableLines: string[], tableKey: number, width: number): ReactNode {
  const allRows = tableLines.map(parseTableRow);
  if (allRows.length === 0) return null;

  const sepIdx = allRows.findIndex(isSepRow);
  const headerRows = sepIdx > 0 ? allRows.slice(0, sepIdx) : [allRows[0]];
  const dataRows = sepIdx >= 0 ? allRows.slice(sepIdx + 1) : allRows.slice(1);

  const colCount = Math.max(...allRows.map((r) => r.length));

  // Natural column widths — use plain text width (strip inline markdown markers)
  const naturalWidths = Array.from({ length: colCount }, (_, ci) => {
    const all = [...headerRows, ...dataRows];
    return Math.max(...all.map((r) => displayWidth(stripInlineMarkdown(r[ci] ?? ""))), 3);
  });

  // Distribute available width. Format: │ cell │ … — each col costs colW + 3, plus trailing │
  // total = 1 + sum(colW + 3) → available_total = width - 1 - colCount * 3
  const pool = Math.max(width - 1 - colCount * 3, colCount * 3);
  const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);
  const colWidths = naturalWidths.map((w) => Math.max(3, Math.round((w / totalNatural) * pool)));

  // ── Border rows ──────────────────────────────────────────────────────────
  const topBorder = `┌${colWidths.map((w) => "─".repeat(w + 2)).join("┬")}┐`;
  const sepBorder = `├${colWidths.map((w) => "─".repeat(w + 2)).join("┼")}┤`;
  const bottomBorder = `└${colWidths.map((w) => "─".repeat(w + 2)).join("┴")}┘`;

  function borderText(str: string, k: string): ReactNode {
    return (
      <text key={k} fg={colors.border.normal} style={{ width }}>
        {str}
      </text>
    );
  }

  function dataRowText(cells: string[], fg: string, k: string): ReactNode {
    const spans: ReactNode[] = [];
    spans.push(
      <span key="bl" fg={colors.border.normal}>
        {"│"}
      </span>
    );
    for (let ci = 0; ci < colCount; ci++) {
      const cellRaw = cells[ci] ?? "";
      const cellPlain = stripInlineMarkdown(cellRaw);
      const padW = Math.max(0, colWidths[ci] - displayWidth(cellPlain));
      spans.push(
        <span key={`sp${ci}`} fg={colors.border.normal}>
          {" "}
        </span>
      );
      spans.push(...inlineSpans(cellRaw, fg, `${k}-cell${ci}`));
      if (padW > 0) {
        spans.push(
          <span key={`pad${ci}`} fg={fg}>
            {" ".repeat(padW)}
          </span>
        );
      }
      spans.push(
        <span key={`ep${ci}`} fg={colors.border.normal}>
          {" │"}
        </span>
      );
    }
    return (
      <text key={k} style={{ width }}>
        {spans}
      </text>
    );
  }

  const rows: ReactNode[] = [];
  rows.push(borderText(topBorder, `${tableKey}-top`));

  for (let hi = 0; hi < headerRows.length; hi++) {
    rows.push(dataRowText(headerRows[hi], colors.accent.ai, `${tableKey}-h${hi}`));
  }
  rows.push(borderText(sepBorder, `${tableKey}-sep`));

  for (let di = 0; di < dataRows.length; di++) {
    rows.push(dataRowText(dataRows[di], colors.fg.primary, `${tableKey}-d${di}`));
  }
  rows.push(borderText(bottomBorder, `${tableKey}-bot`));

  return (
    <box key={`table-${tableKey}`} style={{ flexDirection: "column" }}>
      {rows}
    </box>
  );
}

export function MarkdownContent({
  content,
  width,
}: {
  content: string;
  width: number;
}): ReactNode {
  const defaultFg = colors.fg.primary;
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let inCode = false;
  const codeLines: string[] = [];
  let codeKey = 0;
  const tableLines: string[] = [];
  let tableKey = 0;

  function flushTableIfAny(): void {
    if (tableLines.length === 0) return;
    const node = renderTable(tableLines.splice(0), tableKey++, width);
    if (node) elements.push(node);
  }

  function flushCode(key: number): ReactNode {
    const inner = codeLines.splice(0);
    return (
      <box
        key={`code-${key}`}
        style={{
          flexDirection: "column",
          paddingLeft: 1,
          paddingRight: 1,
          marginTop: 0,
          marginBottom: 0,
          backgroundColor: colors.bg.tertiary,
          border: true,
          borderColor: colors.border.muted,
        }}
      >
        {inner.length === 0 ? (
          <text fg={colors.fg.muted} style={{ width: width - 4 }}>
            {" "}
          </text>
        ) : (
          inner.map((cl, ci) => (
            <text key={ci} fg={colors.accent.tertiary} style={{ width: width - 4 }}>
              {cl || " "}
            </text>
          ))
        )}
      </box>
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // ── Code fence toggle ──
    if (raw.trimStart().startsWith("```")) {
      flushTableIfAny();
      if (inCode) {
        inCode = false;
        elements.push(flushCode(codeKey++));
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    // ── Table row accumulation ──
    if (isTableLine(raw)) {
      tableLines.push(raw);
      continue;
    }
    // Non-table line: flush any accumulated table rows first
    flushTableIfAny();

    // ── Headings (h1–h6) — inline markup supported ──
    const headingMatch = raw.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefix = level === 1 ? "▌ " : level === 2 ? "┃ " : "  ";
      const headingFg =
        level <= 2
          ? colors.accent.ai
          : level === 3
            ? colors.accent.secondary
            : colors.accent.primary;
      elements.push(
        <text key={i} style={{ width }}>
          <span fg={headingFg}>{prefix}</span>
          {inlineSpans(headingMatch[2], headingFg, `h-${i}`)}
        </text>
      );
      continue;
    }

    // ── Blockquote ──
    const bqMatch = raw.match(/^(>{1,3})\s?(.*)/);
    if (bqMatch) {
      const depth = bqMatch[1].length;
      const bqPrefix = `${"  ".repeat(depth - 1)}▍ `;
      elements.push(
        <text key={i} style={{ width }}>
          <span fg={colors.fg.muted}>{bqPrefix}</span>
          {inlineSpans(bqMatch[2], colors.fg.secondary, `bq-${i}`)}
        </text>
      );
      continue;
    }

    // ── Horizontal rule ──
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(raw.trim())) {
      elements.push(
        <text key={i} fg={colors.border.normal} style={{ width }}>
          {"─".repeat(Math.min(width, 38))}
        </text>
      );
      continue;
    }

    // ── Task list item (must be checked before unordered list) ──
    const taskMatch = raw.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)/);
    if (taskMatch) {
      const indent = "  ".repeat(Math.floor(taskMatch[1].length / 2) + 1);
      const checked = taskMatch[2].toLowerCase() === "x";
      const box = checked ? "☑ " : "☐ ";
      const boxFg = checked ? colors.status.success : colors.fg.muted;
      const textFg = checked ? colors.fg.secondary : defaultFg;
      elements.push(
        <text key={i} style={{ width }}>
          <span fg={colors.accent.secondary}>{indent}</span>
          <span fg={boxFg}>{box}</span>
          {inlineSpans(taskMatch[3], textFg, `task-${i}`)}
        </text>
      );
      continue;
    }

    // ── Unordered list item ──
    const ulMatch = raw.match(/^(\s*)[-*+]\s+(.*)/);
    if (ulMatch) {
      const indent = "  ".repeat(Math.floor(ulMatch[1].length / 2) + 1);
      const bullet = `${indent}• `;
      elements.push(
        <text key={i} style={{ width }}>
          <span fg={colors.accent.secondary}>{bullet}</span>
          {inlineSpans(ulMatch[2], defaultFg, `ul-${i}`)}
        </text>
      );
      continue;
    }

    // ── Ordered list item ──
    const olMatch = raw.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (olMatch) {
      const indent = "  ".repeat(Math.floor(olMatch[1].length / 2) + 1);
      const num = olMatch[2];
      const label = `${indent}${num}. `;
      elements.push(
        <text key={i} style={{ width }}>
          <span fg={colors.accent.secondary}>{label}</span>
          {inlineSpans(olMatch[3], defaultFg, `ol-${i}`)}
        </text>
      );
      continue;
    }

    // ── Blank line ──
    if (raw.trim() === "") {
      elements.push(
        <text key={i} style={{ width }}>
          {" "}
        </text>
      );
      continue;
    }

    // ── Plain paragraph line (with inline parsing) ──
    elements.push(
      <text key={i} style={{ width }}>
        {inlineSpans(raw, defaultFg, `p-${i}`)}
      </text>
    );
  }

  // Flush any pending blocks at end of content (handles mid-stream)
  if (inCode && codeLines.length > 0) {
    elements.push(flushCode(codeKey++));
  }
  flushTableIfAny();

  return <box style={{ flexDirection: "column" }}>{elements}</box>;
}
