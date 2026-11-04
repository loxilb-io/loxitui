import type { ReactNode } from "react";
import { colors } from "../theme";

export interface DetailField {
  label: string;
  value: string;
  color?: string;
}

interface DetailPaneProps {
  title: string;
  fields: DetailField[];
  height: number;
}

export function DetailPane({ title, fields, height }: DetailPaneProps): ReactNode {
  if (height < 3) return null;

  const maxContentRows = height - 1; // subtract title row

  // Layout as 2-column pairs
  const pairs: Array<[DetailField, DetailField | null]> = [];
  for (let i = 0; i < fields.length; i += 2) {
    pairs.push([fields[i], fields[i + 1] ?? null]);
  }
  const visiblePairs = pairs.slice(0, maxContentRows);

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1 }}>
      <text fg={colors.accent.primary}>{`── ${title} ──────────────────────────────────`}</text>
      {fields.length === 0 ? (
        <text fg={colors.fg.muted}> Select a row to see details.</text>
      ) : (
        visiblePairs.map(([left, right], i) => (
          <box key={i} style={{ flexDirection: "row" }}>
            <text fg={colors.fg.muted} style={{ width: 14 }}>{`${left.label}:`}</text>
            <text fg={left.color ?? colors.fg.primary} style={{ width: 22 }}>
              {left.value}
            </text>
            {right && <text fg={colors.fg.muted} style={{ width: 14 }}>{`${right.label}:`}</text>}
            {right && <text fg={right.color ?? colors.fg.primary}>{right.value}</text>}
          </box>
        ))
      )}
    </box>
  );
}
