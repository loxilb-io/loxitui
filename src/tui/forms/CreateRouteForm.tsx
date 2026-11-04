import type { RouteEntry } from "@/api/models";
import { useKeyboard } from "@opentui/react";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { colors } from "../theme";
import { routeFormSchema } from "./validation";

type FormField = "dst" | "gw" | "proto";

const FIELDS: { id: FormField; label: string; placeholder: string }[] = [
  { id: "dst", label: "Destination", placeholder: "e.g. 10.0.0.0/24" },
  { id: "gw", label: "Gateway", placeholder: "e.g. 192.168.1.1 (optional)" },
  { id: "proto", label: "Protocol", placeholder: "e.g. 254 (optional)" },
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateRouteForm({ onClose, onCreated }: Props): ReactNode {
  const { state } = useApp();
  const [focusIdx, setFocusIdx] = useState(0);
  const [values, setValues] = useState<Record<FormField, string>>({
    dst: "",
    gw: "",
    proto: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const parsed = routeFormSchema.safeParse({
      destinationIPNet: values.dst,
      gateway: values.gw || undefined,
      protocol: values.proto || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }

    const route: RouteEntry = {
      destinationIPNet: parsed.data.destinationIPNet,
      gateway: parsed.data.gateway || undefined,
      protocol: parsed.data.protocol,
    };

    setSubmitting(true);
    setError(null);
    const result = await state.api.route.create(route);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
    } else {
      onCreated();
    }
  }, [values, state.api, onCreated]);

  useKeyboard(
    useCallback(
      (key: { name: string; shift?: boolean; sequence?: string }) => {
        const fieldId = FIELDS[focusIdx]?.id;

        if (key.name === "escape") {
          onClose();
        } else if (key.name === "tab" && key.shift) {
          setFocusIdx((i) => (i - 1 + FIELDS.length) % FIELDS.length);
        } else if (key.name === "tab" || key.name === "down") {
          setFocusIdx((i) => (i + 1) % FIELDS.length);
        } else if (key.name === "up") {
          setFocusIdx((i) => (i - 1 + FIELDS.length) % FIELDS.length);
        } else if (key.name === "return") {
          if (focusIdx < FIELDS.length - 1) {
            setFocusIdx((i) => i + 1);
          } else {
            void submit();
          }
        } else if (key.name === "backspace") {
          setValues((v) => ({ ...v, [fieldId]: v[fieldId].slice(0, -1) }));
        } else if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
          setValues((v) => ({ ...v, [fieldId]: v[fieldId] + key.sequence }));
        }
      },
      [focusIdx, submit, onClose]
    )
  );

  return (
    <box
      style={{
        position: "absolute",
        top: 2,
        left: 4,
        width: 50,
        height: FIELDS.length + 7,
        flexDirection: "column",
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.accent.primary,
        padding: 1,
      }}
    >
      <text fg={colors.accent.primary}>Add Route</text>
      {FIELDS.map((f, i) => (
        <box key={f.id} style={{ flexDirection: "row", marginTop: 0 }}>
          <text fg={colors.fg.muted} style={{ width: 14 }}>
            {f.label}:
          </text>
          <text>
            <span fg={i === focusIdx ? colors.accent.primary : colors.fg.secondary}>
              {values[f.id] || (i === focusIdx ? "" : f.placeholder)}
            </span>
            {i === focusIdx && <span fg={colors.accent.primary}>{"\u2588"}</span>}
          </text>
        </box>
      ))}
      {error && <text fg={colors.status.error}>Error: {error}</text>}
      <text fg={colors.fg.muted}>
        {submitting ? "Adding..." : "Tab=next  Enter=submit  Esc=cancel"}
      </text>
    </box>
  );
}
