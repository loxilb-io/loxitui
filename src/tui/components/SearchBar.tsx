import { useKeyboard } from "@opentui/react";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { colors } from "../theme";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  width: number;
  matchCount?: number;
  totalCount?: number;
}

/**
 * SearchBar component for panel search functionality
 * Captures keyboard input and displays current search query
 */
export function SearchBar({
  query,
  onQueryChange,
  onClose,
  width,
  matchCount,
  totalCount,
}: Props): ReactNode {
  useKeyboard(
    useCallback(
      (key: { name: string; ctrl?: boolean; shift?: boolean; sequence?: string }) => {
        // Don't capture Ctrl keys - let them bubble to parent handlers
        if (key.ctrl) return;

        // Escape is now handled by App.tsx to close search
        // Don't handle it here to avoid conflicts

        // Handle backspace
        if (key.name === "backspace") {
          onQueryChange(query.slice(0, -1));
          return;
        }

        // Handle Enter (just close, don't do anything special)
        if (key.name === "return") {
          onClose();
          return;
        }

        // Capture regular character input
        if (key.sequence && key.sequence.length === 1) {
          // Don't capture control characters
          const char = key.sequence;
          if (char >= " " && char <= "~") {
            onQueryChange(query + char);
          }
          return;
        }
      },
      [query, onQueryChange, onClose]
    )
  );

  // Create input display with cursor
  const inputWidth = Math.max(20, width - 25); // Reserve space for label and border
  const displayQuery = query.padEnd(inputWidth, " ");
  const cursor = "▏"; // Thin vertical bar cursor

  // Format match info if provided
  const matchInfo =
    matchCount !== undefined && totalCount !== undefined ? ` [${matchCount} of ${totalCount}]` : "";

  return (
    <box
      style={{
        flexDirection: "column",
        borderStyle: "rounded",
        borderColor: colors.accent.primary,
        width,
        height: 3,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: colors.bg.secondary,
      }}
    >
      <text fg={colors.fg.primary}>
        <span fg={colors.accent.primary}>🔍 Search: </span>
        <span bg={colors.bg.highlight}>
          {displayQuery}
          {cursor}
        </span>
        <span fg={colors.fg.secondary}>{matchInfo}</span>
        <span fg={colors.fg.muted}> (Esc or ^F to close)</span>
      </text>
    </box>
  );
}
