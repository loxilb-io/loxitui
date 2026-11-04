import type { LbEndPoint, LbServiceArg } from "@/api/models";
import { useKeyboard } from "@opentui/react";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { colors } from "../theme";
import { lbServiceFormSchema } from "./validation";

// ─── Step 1 fields: service config ───────────────────────────────────────────

type Step1Field =
  | "name"
  | "vip"
  | "port"
  | "proto"
  | "sel"
  | "mode"
  | "monitor"
  | "bgp"
  | "snat"
  | "model_name"
  | "sse_mode";

const STEP1_FIELDS: { id: Step1Field; label: string; ph: string }[] = [
  { id: "name", label: "Name", ph: "e.g. web-svc" },
  { id: "vip", label: "VIP Address", ph: "e.g. 10.0.0.1" },
  { id: "port", label: "Port", ph: "1-65535" },
  { id: "proto", label: "Protocol", ph: "tcp/udp/sctp/http/https/quic" },
  { id: "sel", label: "LB Algorithm", ph: "0=RR 1=Hash 2=WRR 3=Persist" },
  { id: "mode", label: "NAT Mode", ph: "0=DNAT 1=OneArm 2=FullNAT" },
  { id: "monitor", label: "Monitor", ph: "true/false" },
  { id: "bgp", label: "BGP", ph: "true/false" },
  { id: "snat", label: "SNAT", ph: "true/false" },
  { id: "model_name", label: "Model Name", ph: "(optional)" },
  { id: "sse_mode", label: "SSE Mode", ph: "true/false (optional)" },
];

// ─── Step 2 fields: per-endpoint ─────────────────────────────────────────────

interface EndpointRow {
  ip: string;
  port: string;
  weight: string;
}

const EMPTY_EP: EndpointRow = { ip: "", port: "", weight: "1" };
type EpField = "ip" | "port" | "weight";
const EP_FIELDS: { id: EpField; label: string; ph: string }[] = [
  { id: "ip", label: "EP IP", ph: "e.g. 192.168.1.10" },
  { id: "port", label: "EP Port", ph: "e.g. 8080" },
  { id: "weight", label: "Weight", ph: "1" },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateLbServiceForm({ onClose, onCreated }: Props): ReactNode {
  const { state } = useApp();
  const [step, setStep] = useState(1);
  const [focusIdx, setFocusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 state
  const [s1, setS1] = useState<Record<Step1Field, string>>({
    name: "",
    vip: "",
    port: "",
    proto: "tcp",
    sel: "0",
    mode: "0",
    monitor: "false",
    bgp: "false",
    snat: "false",
    model_name: "",
    sse_mode: "false",
  });

  // Step 2 state: dynamic endpoint rows
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([{ ...EMPTY_EP }]);
  const [epRow, setEpRow] = useState(0);
  const [epCol, setEpCol] = useState(0);

  const validate = useCallback(() => {
    const parsed = lbServiceFormSchema.safeParse({
      externalIP: s1.vip,
      port: s1.port,
      protocol: s1.proto,
      sel: s1.sel,
      mode: s1.mode,
      name: s1.name,
      monitor: s1.monitor === "true",
      bgp: s1.bgp === "true",
      snat: s1.snat === "true",
      model_name: s1.model_name || undefined,
      sse_mode: s1.sse_mode === "true" ? true : undefined,
      endpoints: endpoints.map((ep) => ({
        endpointIP: ep.ip,
        targetPort: ep.port,
        weight: ep.weight,
      })),
    });
    return parsed;
  }, [s1, endpoints]);

  const submit = useCallback(async () => {
    const parsed = validate();
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const d = parsed.data;
    const eps: LbEndPoint[] = d.endpoints.map((ep) => ({
      endpointIP: ep.endpointIP,
      targetPort: ep.targetPort,
      weight: ep.weight,
    }));
    const svc: LbServiceArg = {
      serviceArguments: {
        externalIP: d.externalIP,
        port: d.port,
        protocol: d.protocol,
        sel: d.sel,
        mode: d.mode,
        name: d.name,
        monitor: d.monitor,
        bgp: d.bgp,
        snat: d.snat,
        model_name: d.model_name,
        sse_mode: d.sse_mode,
      },
      endpoints: eps,
    };

    setSubmitting(true);
    setError(null);
    const result = await state.api.lb.create(svc);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
    } else {
      onCreated();
    }
  }, [validate, state.api, onCreated]);

  // ─── Step 1 keyboard ─────────────────────────────────────────────────────
  const handleStep1 = useCallback(
    (key: { name: string; shift?: boolean; sequence?: string }) => {
      const fieldId = STEP1_FIELDS[focusIdx]?.id;
      if (key.name === "escape") {
        onClose();
      } else if (key.name === "tab" && key.shift) {
        setFocusIdx((i) => (i - 1 + STEP1_FIELDS.length) % STEP1_FIELDS.length);
      } else if (key.name === "tab" || key.name === "down") {
        setFocusIdx((i) => (i + 1) % STEP1_FIELDS.length);
      } else if (key.name === "up") {
        setFocusIdx((i) => (i - 1 + STEP1_FIELDS.length) % STEP1_FIELDS.length);
      } else if (key.name === "return") {
        setError(null);
        setStep(2);
        setFocusIdx(0);
        setEpRow(0);
        setEpCol(0);
      } else if (key.name === "backspace") {
        setS1((v) => ({ ...v, [fieldId]: v[fieldId].slice(0, -1) }));
      } else if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setS1((v) => ({ ...v, [fieldId]: v[fieldId] + key.sequence }));
      }
    },
    [focusIdx, onClose]
  );

  // ─── Step 2 keyboard ─────────────────────────────────────────────────────
  const handleStep2 = useCallback(
    (key: { name: string; shift?: boolean; sequence?: string }) => {
      if (key.name === "escape") {
        setStep(1);
        setError(null);
        return;
      }
      if (key.sequence === "+" || key.sequence === "=") {
        setEndpoints((eps) => [...eps, { ...EMPTY_EP }]);
        setEpRow(endpoints.length);
        setEpCol(0);
        return;
      }
      if (key.sequence === "-" && endpoints.length > 1) {
        setEndpoints((eps) => eps.filter((_, i) => i !== epRow));
        setEpRow((r) => Math.min(r, endpoints.length - 2));
        return;
      }
      if (key.name === "return") {
        setError(null);
        setStep(3);
        return;
      }
      if (key.name === "tab" && key.shift) {
        if (epCol > 0) setEpCol((c) => c - 1);
        else if (epRow > 0) {
          setEpRow((r) => r - 1);
          setEpCol(EP_FIELDS.length - 1);
        }
        return;
      }
      if (key.name === "tab" || key.name === "down") {
        if (epCol < EP_FIELDS.length - 1) setEpCol((c) => c + 1);
        else if (epRow < endpoints.length - 1) {
          setEpRow((r) => r + 1);
          setEpCol(0);
        }
        return;
      }
      if (key.name === "up") {
        if (epCol > 0) setEpCol((c) => c - 1);
        else if (epRow > 0) {
          setEpRow((r) => r - 1);
          setEpCol(EP_FIELDS.length - 1);
        }
        return;
      }
      const fieldId = EP_FIELDS[epCol]?.id;
      if (key.name === "backspace") {
        setEndpoints((eps) =>
          eps.map((ep, i) => (i === epRow ? { ...ep, [fieldId]: ep[fieldId].slice(0, -1) } : ep))
        );
      } else if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setEndpoints((eps) =>
          eps.map((ep, i) => (i === epRow ? { ...ep, [fieldId]: ep[fieldId] + key.sequence } : ep))
        );
      }
    },
    [endpoints, epRow, epCol]
  );

  // ─── Step 3 keyboard ─────────────────────────────────────────────────────
  const handleStep3 = useCallback(
    (key: { name: string }) => {
      if (key.name === "escape") {
        setStep(2);
        setError(null);
      } else if (key.name === "return") {
        void submit();
      }
    },
    [submit]
  );

  useKeyboard(
    useCallback(
      (key: { name: string; shift?: boolean; sequence?: string }) => {
        if (step === 1) handleStep1(key);
        else if (step === 2) handleStep2(key);
        else handleStep3(key);
      },
      [step, handleStep1, handleStep2, handleStep3]
    )
  );

  // ─── Rendering ───────────────────────────────────────────────────────────
  const stepLabel = `Step ${step}/3`;
  const title =
    step === 1 ? "Create LB — Config" : step === 2 ? "Create LB — Endpoints" : "Create LB — Review";

  const formH = step === 1 ? STEP1_FIELDS.length + 6 : step === 2 ? endpoints.length * 3 + 7 : 14;

  return (
    <box
      style={{
        position: "absolute",
        top: 2,
        left: 4,
        width: 50,
        height: Math.min(formH, 24),
        flexDirection: "column",
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.accent.primary,
        padding: 1,
      }}
    >
      <text fg={colors.accent.primary}>
        {title} <span fg={colors.fg.muted}>[{stepLabel}]</span>
      </text>

      {step === 1 && renderStep1(s1, focusIdx)}
      {step === 2 && renderStep2(endpoints, epRow, epCol)}
      {step === 3 && renderStep3(s1, endpoints)}

      {error && <text fg={colors.status.error}>Error: {error}</text>}
      <text fg={colors.fg.muted}>
        {submitting
          ? "Creating..."
          : step === 1
            ? "Tab/↑↓=nav Enter=next Esc=close"
            : step === 2
              ? "+add -del Enter=next Esc=back"
              : "Enter=submit Esc=back"}
      </text>
    </box>
  );
}

// ─── Render helpers ──────────────────────────────────────────────────────────

function renderStep1(s1: Record<Step1Field, string>, focusIdx: number): ReactNode {
  return STEP1_FIELDS.map((f, i) => (
    <box key={f.id} style={{ flexDirection: "row" }}>
      <text fg={colors.fg.muted} style={{ width: 14 }}>
        {f.label}:
      </text>
      <text>
        <span fg={i === focusIdx ? colors.accent.primary : colors.fg.secondary}>
          {s1[f.id] || (i === focusIdx ? "" : f.ph)}
        </span>
        {i === focusIdx && <span fg={colors.accent.primary}>{"\u2588"}</span>}
      </text>
    </box>
  ));
}

function renderStep2(endpoints: EndpointRow[], epRow: number, epCol: number): ReactNode {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={colors.fg.secondary}>Endpoints ({endpoints.length}) — [+] add [-] del</text>
      {endpoints.map((ep, ri) =>
        EP_FIELDS.map((f, ci) => {
          const active = ri === epRow && ci === epCol;
          return (
            <box key={`${ri}-${f.id}`} style={{ flexDirection: "row" }}>
              <text fg={colors.fg.muted} style={{ width: 14 }}>
                {ci === 0 ? `EP ${ri + 1} ` : "  "}
                {f.label}:
              </text>
              <text>
                <span fg={active ? colors.accent.primary : colors.fg.secondary}>
                  {ep[f.id] || (active ? "" : f.ph)}
                </span>
                {active && <span fg={colors.accent.primary}>{"\u2588"}</span>}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}

function renderStep3(s1: Record<Step1Field, string>, endpoints: EndpointRow[]): ReactNode {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={colors.fg.secondary}>── Service ──</text>
      <text fg={colors.fg.primary}>
        {s1.vip}:{s1.port}/{s1.proto}
      </text>
      <text fg={colors.fg.muted}>
        sel={s1.sel} mode={s1.mode} name={s1.name}
      </text>
      <text fg={colors.fg.muted}>
        mon={s1.monitor} bgp={s1.bgp} snat={s1.snat}
      </text>
      {s1.model_name && <text fg={colors.fg.muted}>model={s1.model_name}</text>}
      <text fg={colors.fg.secondary}>── Endpoints ──</text>
      {endpoints.map((ep, i) => (
        <text key={i} fg={colors.fg.primary}>
          {ep.ip}:{ep.port} w={ep.weight}
        </text>
      ))}
    </box>
  );
}
