export interface ParsedCommand {
  verb: string;
  resource: string;
  args: string[];
  flags: Record<string, string>;
}

const VERB_ALIASES: Record<string, string> = {
  ls: "list",
  get: "list",
  add: "create",
  rm: "delete",
  del: "delete",
  remove: "delete",
  set: "update",
  patch: "update",
  describe: "show",
};

const RESOURCE_ALIASES: Record<string, string> = {
  loadbalancer: "lb",
  svc: "lb",
  ep: "endpoint",
  ct: "conntrack",
  fw: "firewall",
  mirror: "mirrortrack",
  bgp: "bgppeer",
};

/** Canonical verbs recognised by the command system. */
const CANONICAL_VERBS = new Set(["list", "create", "delete", "update", "show"]);

/** Canonical resource names recognised by the command system. */
const CANONICAL_RESOURCES = new Set([
  "lb",
  "endpoint",
  "route",
  "conntrack",
  "ipsec",
  "firewall",
  "vlan",
  "mirrortrack",
  "session",
  "bgppeer",
]);

/** Map a raw verb token to its canonical form. */
export function normaliseVerb(raw: string): string {
  const lower = raw.toLowerCase();
  const mapped = VERB_ALIASES[lower] ?? lower;
  return CANONICAL_VERBS.has(mapped) ? mapped : mapped;
}

/** Map a raw resource token to its canonical form. */
export function normaliseResource(raw: string): string {
  const lower = raw.toLowerCase();
  const mapped = RESOURCE_ALIASES[lower] ?? lower;
  // Only lowercase recognised resources; other tokens (e.g. file paths for
  // lifecycle commands like ":restore /tmp/Snap.json") keep their case.
  return CANONICAL_RESOURCES.has(mapped) ? mapped : raw;
}

/**
 * Parse a simple loxicmd-like command string into structured form.
 * Examples:
 *   "list lb"            → { verb: "list", resource: "lb", args: [], flags: {} }
 *   "create lb 10.0.0.1 tcp 80" → { verb: "create", resource: "lb", args: [...] }
 *   "delete route --dst 10.0.0.0/24"
 */
export function parseCommand(input: string): ParsedCommand {
  const tokens = tokenize(input);
  if (tokens.length === 0) return { verb: "", resource: "", args: [], flags: {} };

  const verb = normaliseVerb(tokens[0] ?? "");
  const resource = normaliseResource(tokens[1] ?? "");
  const rest = tokens.slice(2);

  const args: string[] = [];
  const flags: Record<string, string> = {};

  let i = 0;
  while (i < rest.length) {
    const tok = rest[i] as string;
    if (tok.startsWith("--")) {
      const body = tok.slice(2);
      const eqIdx = body.indexOf("=");
      if (eqIdx !== -1) {
        flags[body.slice(0, eqIdx)] = body.slice(eqIdx + 1);
        i++;
      } else {
        const next = rest[i + 1];
        if (next && !next.startsWith("-")) {
          flags[body] = next;
          i += 2;
        } else {
          flags[body] = "true";
          i++;
        }
      }
    } else if (tok.startsWith("-") && tok.length >= 2 && tok[1] !== "-") {
      const key = tok.slice(1);
      const eqIdx = key.indexOf("=");
      if (eqIdx !== -1) {
        flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
        i++;
      } else {
        const next = rest[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i += 2;
        } else {
          flags[key] = "true";
          i++;
        }
      }
    } else {
      args.push(tok);
      i++;
    }
  }

  return { verb, resource, args, flags };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of input) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " " || ch === "\t") {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}
