import type { LoxilbApi } from "@/api";
import type { ParsedCommand } from "./parser";

export type CmdResult = { ok: true; output: string } | { ok: false; error: string };

/**
 * Execute a parsed command against the LoxiLB API.
 * Returns formatted text output (markdown-like table or confirmation).
 */
export async function executeCommand(cmd: ParsedCommand, api: LoxilbApi): Promise<CmdResult> {
  const { verb, resource, args, flags } = cmd;

  try {
    switch (verb) {
      case "list":
        return await handleList(resource, api);
      case "create":
        return await handleCreate(resource, args, flags, api);
      case "delete":
        return await handleDelete(resource, args, flags, api);
      case "":
        return { ok: false, error: "Empty command" };
      default:
        return { ok: false, error: `Unknown verb: ${verb}. Try list|create|delete` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function handleList(resource: string, api: LoxilbApi): Promise<CmdResult> {
  switch (resource) {
    case "lb":
    case "service":
    case "services": {
      const r = await api.lb.list();
      if (!r.ok) return { ok: false, error: r.error.message };
      const lines = r.data.map((s) => {
        const sa = s.serviceArguments;
        // swagger: externalIP → Go JSON tag: json:"externalIP"; port → json:"port"
        return `${sa.externalIP}:${sa.port}/${sa.protocol} -> ${s.endpoints?.length ?? 0} eps`;
      });
      return { ok: true, output: lines.length ? lines.join("\n") : "(no services)" };
    }
    case "ep":
    case "endpoint":
    case "endpoints": {
      const r = await api.ep.list();
      if (!r.ok) return { ok: false, error: r.error.message };
      // swagger: EndPointGetEntry → hostName, name, probeType (not epIP, epPort, epProto)
      const lines = r.data.map((e) => `${e.hostName ?? "?"} ${e.name ?? ""} ${e.probeType ?? ""}`);
      return { ok: true, output: lines.length ? lines.join("\n") : "(no endpoints)" };
    }
    case "route":
    case "routes": {
      const r = await api.route.list();
      if (!r.ok) return { ok: false, error: r.error.message };
      // swagger: destinationIPNet → Go JSON tag: json:"destinationIPNet"; gateway → json:"gateway"
      const lines = r.data.map(
        (rt) => `${rt.destinationIPNet} via ${rt.gateway ?? "-"} dev ${rt.ifname ?? "-"}`
      );
      return { ok: true, output: lines.length ? lines.join("\n") : "(no routes)" };
    }
    case "cluster": {
      const r = await api.cluster.list();
      if (!r.ok) return { ok: false, error: r.error.message };
      const lines = r.data.map((ci) => `instance=${ci.instance} state=${ci.state}`);
      return { ok: true, output: lines.length ? lines.join("\n") : "(no cluster state)" };
    }
    default:
      return { ok: false, error: `Unknown resource: ${resource}. Try lb|ep|route|cluster` };
  }
}

async function handleCreate(
  resource: string,
  args: string[],
  flags: Record<string, string>,
  api: LoxilbApi
): Promise<CmdResult> {
  switch (resource) {
    case "lb":
    case "service": {
      const externalIP = args[0] ?? flags.vip ?? flags.ip ?? "";
      const port = Number.parseInt(args[1] ?? flags.port ?? "0", 10);
      const proto = args[2] ?? flags.proto ?? "tcp";
      if (!externalIP || !port)
        return { ok: false, error: "Usage: create lb <vip> <port> [proto]" };
      const validProtos = ["tcp", "udp", "sctp", "icmp", "none", "http", "https", "quic"] as const;
      type ValidProto = (typeof validProtos)[number];
      const protoLower = proto.toLowerCase();
      const validProto: ValidProto = (validProtos as readonly string[]).includes(protoLower)
        ? (protoLower as ValidProto)
        : "tcp";
      const r = await api.lb.create({
        // swagger: externalIP → Go JSON tag: json:"externalIP"; port → json:"port"
        serviceArguments: { externalIP, port, protocol: validProto, name: externalIP },
        endpoints: [],
      });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, output: `Created LB service ${externalIP}:${port}/${proto}` };
    }
    case "route": {
      const destinationIPNet = args[0] ?? flags.dst ?? "";
      const gateway = args[1] ?? flags.gw;
      const ifname = flags.dev ?? flags.ifname;
      if (!destinationIPNet)
        return { ok: false, error: "Usage: create route <dst> [gw] [--dev <iface>]" };
      // swagger: destinationIPNet → Go JSON tag: json:"destinationIPNet"; gateway → json:"gateway"
      const r = await api.route.create({ destinationIPNet, gateway, ifname });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, output: `Created route ${destinationIPNet}` };
    }
    default:
      return { ok: false, error: `Create not supported for: ${resource}` };
  }
}

async function handleDelete(
  resource: string,
  args: string[],
  flags: Record<string, string>,
  api: LoxilbApi
): Promise<CmdResult> {
  switch (resource) {
    case "lb":
    case "service": {
      const externalIP = args[0] ?? flags.vip ?? "";
      const port = Number.parseInt(args[1] ?? flags.port ?? "0", 10);
      const proto = args[2] ?? flags.proto ?? "tcp";
      if (!externalIP || !port)
        return { ok: false, error: "Usage: delete lb <vip> <port> [proto]" };
      const validProtos = ["tcp", "udp", "sctp", "icmp", "none", "http", "https", "quic"] as const;
      type ValidProto = (typeof validProtos)[number];
      const protoLower = proto.toLowerCase();
      const validProto: ValidProto = (validProtos as readonly string[]).includes(protoLower)
        ? (protoLower as ValidProto)
        : "tcp";
      // swagger: externalIP → Go JSON tag: json:"externalIP"; port → json:"port"
      const r = await api.lb.delete({ externalIP, port, protocol: validProto });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, output: `Deleted LB service ${externalIP}:${port}` };
    }
    case "route": {
      const destinationIPNet = args[0] ?? flags.dst ?? "";
      if (!destinationIPNet) return { ok: false, error: "Usage: delete route <dst>" };
      // swagger: destinationIPNet → Go JSON tag: json:"destinationIPNet"
      const r = await api.route.delete({ destinationIPNet });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, output: `Deleted route ${destinationIPNet}` };
    }
    default:
      return { ok: false, error: `Delete not supported for: ${resource}` };
  }
}
