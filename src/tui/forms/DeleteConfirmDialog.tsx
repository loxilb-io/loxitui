import { useKeyboard } from "@opentui/react";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { colors } from "../theme";

interface Props {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ title, message, onConfirm, onCancel }: Props): ReactNode {
  useKeyboard(
    useCallback(
      (key: { name: string }) => {
        if (key.name === "y" || key.name === "return") {
          onConfirm();
        } else if (key.name === "n" || key.name === "escape") {
          onCancel();
        }
      },
      [onConfirm, onCancel]
    )
  );

  return (
    <box
      style={{
        position: "absolute",
        top: 4,
        left: 8,
        width: 50,
        height: 8,
        flexDirection: "column",
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.status.error,
        padding: 1,
      }}
    >
      <text fg={colors.status.error}>{title}</text>
      <text fg={colors.fg.primary}>{message}</text>
      <text> </text>
      <text>
        <span fg={colors.status.error}>[y] Confirm</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.fg.secondary}>[n/Esc] Cancel</span>
      </text>
    </box>
  );
}
