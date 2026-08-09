import { useKeyboard } from "@opentui/react";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseCommand } from "../../cmd/parser";
import { HELP_TEXT, dispatch } from "../commands/dispatcher";
import { useApp } from "../state";
import { colors } from "../theme";

const MAX_HISTORY = 20;

interface Props {
  onClose: () => void;
  onResult: (msg: string, isError: boolean) => void;
}

export function CommandPalette({ onClose, onResult }: Props): ReactNode {
  const { state } = useApp();
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpScroll, setHelpScroll] = useState(0);
  const historyRef = useRef<string[]>([]);

  const helpLines = HELP_TEXT.split("\n");

  useKeyboard(
    useCallback(
      (key: { name: string; ctrl?: boolean; shift?: boolean; sequence?: string }) => {
        // Help overlay mode — scroll or close
        if (helpVisible) {
          if (key.name === "escape" || key.name === "return") {
            setHelpVisible(false);
            setHelpScroll(0);
            onClose();
            return;
          }
          if (key.name === "up" || key.name === "k") {
            setHelpScroll((s) => Math.max(0, s - 1));
            return;
          }
          if (key.name === "down" || key.name === "j") {
            setHelpScroll((s) => s + 1);
            return;
          }
          return;
        }

        if (key.name === "escape") {
          onClose();
          return;
        }

        if (key.name === "backspace") {
          if (input.length === 0) {
            onClose();
            return;
          }
          setInput((prev) => prev.slice(0, -1));
          setHistoryIndex(-1);
          return;
        }

        if (key.name === "return") {
          const trimmed = input.trim();
          if (trimmed.length === 0) {
            onClose();
            return;
          }

          // Add to history
          const history = historyRef.current;
          if (history[0] !== trimmed) {
            history.unshift(trimmed);
            if (history.length > MAX_HISTORY) history.pop();
          }

          // Check for help / ? special commands
          if (trimmed === "help" || trimmed === "?") {
            setHelpVisible(true);
            setHelpScroll(0);
            return;
          }

          // Parse and dispatch against the gateway API
          const parsed = parseCommand(trimmed);
          void dispatch(parsed, state.api.raw).then(
            (r) => onResult(r.ok ? r.message : `[Error] ${r.message}`, !r.ok),
            (err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              onResult(`[Error] ${msg}`, true);
            }
          );
          return;
        }

        if (key.name === "up") {
          const history = historyRef.current;
          if (history.length === 0) return;
          const next = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(next);
          setInput(history[next] ?? "");
          return;
        }

        if (key.name === "down") {
          const history = historyRef.current;
          if (historyIndex <= 0) {
            setHistoryIndex(-1);
            setInput("");
            return;
          }
          const next = historyIndex - 1;
          setHistoryIndex(next);
          setInput(history[next] ?? "");
          return;
        }

        // Regular character input
        if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
          setInput((prev) => prev + key.sequence);
          setHistoryIndex(-1);
        }
      },
      [input, historyIndex, helpVisible, onClose, onResult, state.api.raw]
    )
  );

  // Help overlay mode
  if (helpVisible) {
    const maxVisible = 20;
    const clampedScroll = Math.min(helpScroll, Math.max(0, helpLines.length - maxVisible));
    const visibleLines = helpLines.slice(clampedScroll, clampedScroll + maxVisible);

    return (
      <box
        style={{
          position: "absolute",
          bottom: 1,
          left: 0,
          width: "100%",
          height: maxVisible + 2,
          flexDirection: "column",
          backgroundColor: colors.bg.secondary,
          borderColor: colors.accent.primary,
          borderStyle: "single",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {visibleLines.map((line, i) => (
          <text key={`help-${clampedScroll + i}`}>
            <span
              fg={
                line.startsWith("---") ||
                line.startsWith("Resources:") ||
                line.startsWith("Examples:")
                  ? colors.accent.primary
                  : colors.fg.primary
              }
            >
              {line}
            </span>
          </text>
        ))}
        <text>
          <span fg={colors.fg.secondary}>{"  [↑↓ scroll | Esc/Enter close]"}</span>
        </text>
      </box>
    );
  }

  return (
    <box
      style={{
        position: "absolute",
        bottom: 1,
        left: 0,
        width: "100%",
        height: 1,
        flexDirection: "row",
        backgroundColor: colors.bg.secondary,
        borderColor: colors.accent.primary,
      }}
    >
      <text>
        <span fg={colors.accent.primary}>:</span>
        <span fg={colors.fg.primary}>{input}</span>
        <span fg={colors.accent.primary}>_</span>
      </text>
    </box>
  );
}
