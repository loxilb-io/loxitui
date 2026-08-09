import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAuditLogger } from "@/audit";

export interface Skill {
  name: string;
  description: string;
  content: string;
}

/** Paths to scan for skill .md files, in priority order */
function skillCandidateDirs(): string[] {
  const scriptDir = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  })();

  return [
    process.env.LOXILB_SKILLS_PATH ?? "",
    path.join(scriptDir, "claude-agents", "agents"),
    path.join(scriptDir, "..", "claude-agents", "agents"),
    path.join(scriptDir, "..", "..", "claude-agents", "agents"),
    path.join(process.cwd(), "claude-agents", "agents"),
  ].filter(Boolean);
}

const SYSTEM_SKILL: Skill = {
  name: "loxilb-assistant",
  description: "General LoxiLB operations assistant",
  content: `You are an expert LoxiLB operations assistant embedded in loxitui.
LoxiLB is a cloud-native eBPF load balancer for Kubernetes and 5G/telco workloads.
You have access to live state from the LoxiLB REST API (shown in the context).
Help the operator understand LB services, endpoints, conntrack, routes and cluster state.
Provide actionable, concise answers. Suggest API calls or config changes when helpful.`,
};

export const SKILL_MAP: Record<string, Skill> = {
  default: SYSTEM_SKILL,
};

let _loaded = false;
/** Directory that was actually used for skill loading (empty string until loadSkills runs) */
let _skillsDir = "";

/**
 * Keyword routing table — maps skill name to patterns that trigger it.
 * Patterns are matched case-insensitively against the user query.
 */
const SKILL_KEYWORDS: Record<string, string[]> = {
  "loxilb-ebpf": [
    "ebpf",
    "xdp",
    "tc hook",
    "packet flow",
    "nat mode",
    "onearm",
    "fullnat",
    "dsr",
    "conntrack",
    "connection track",
    "packet drop",
    "bpf map",
    "pinned map",
  ],
  "loxilb-kubernetes": [
    "kubernetes",
    "k8s",
    "kube-loxilb",
    "annotation",
    "service type",
    "loadbalancer",
    "deployment",
    "pod",
    "namespace",
    "kubectl",
    "helm",
    "operator",
    "multus",
    "cni",
    "ipvlan",
    "macvlan",
    "multihoming",
    "multi-homing",
  ],
  "loxilb-protocols": [
    "sctp",
    "gtp",
    "quic",
    "udp",
    "tcp",
    "http",
    "https",
    "protocol",
    "5g",
    "upstream",
    "tunnel",
  ],
  "loxilb-troubleshooting": [
    "not working",
    "broken",
    "debug",
    "failing",
    "fail",
    "error",
    "unreachable",
    "troubleshoot",
    "investigate",
    "diagnose",
    "issue",
    "problem",
    "fix",
  ],
  "loxilb-bgp-networking": [
    "bgp",
    "ecmp",
    "ha",
    "high availability",
    "routing",
    "route",
    "peer",
    "asn",
    "prefix",
    "failover",
    "cluster",
    "active-active",
    "active-passive",
  ],
};

/**
 * Words that frequently appear in general English queries but happen to be in SKILL_KEYWORDS.
 * Matched patterns from this set get their weight halved to reduce false positives.
 */
const GENERIC_KEYWORDS = new Set([
  "fail",
  "error",
  "issue",
  "problem",
  "fix",
  "broken",
  "debug",
  "route",
  "routing",
  "peer",
  "cluster",
  "prefix",
  "upstream",
  "tunnel",
  "protocol",
  "operator",
  "tcp",
  "udp",
  "http",
  "https",
]);

/**
 * Per-keyword confidence weight, computed once at module init from SKILL_KEYWORDS:
 *   base_weight = 1.0 / (number of skills containing this keyword)  [IDF-style]
 *   final_weight = base_weight × (0.5 if generic, else 1.0)
 *
 * Domain-specific single-skill keywords (e.g. "ebpf", "sctp", "bgp") → weight 1.0.
 * Generic or multi-skill words (e.g. "fail", "tcp") → weight < 0.5.
 */
const KEYWORD_WEIGHTS: Map<string, number> = (() => {
  const skillCount = new Map<string, number>();
  for (const patterns of Object.values(SKILL_KEYWORDS)) {
    for (const p of patterns) {
      skillCount.set(p, (skillCount.get(p) ?? 0) + 1);
    }
  }
  const weights = new Map<string, number>();
  for (const [kw, count] of skillCount) {
    const base = 1.0 / count;
    const penalty = GENERIC_KEYWORDS.has(kw) ? 0.5 : 1.0;
    weights.set(kw, base * penalty);
  }
  return weights;
})();

/**
 * Minimum confidence score to commit to a skill via keyword matching.
 * Queries below this threshold fall through to the LLM classifier.
 *
 * confidence = Σ weight(matched_kw) × (matched_count / query_word_count)
 *
 * Examples:
 *   "BGP HA setup"               bgp(1)+ha(1)=2.0 × 2/3 = 1.33  → PASS
 *   "what can loxilb do for ha?" ha(1) × 1/7   = 0.14           → FAIL → LLM
 *   "I have a problem"           problem(0.25) × 1/4 = 0.06     → FAIL → LLM
 *   "service is failing"         fail(0.25) × 1/3 = 0.08        → FAIL → LLM
 */
const MIN_KEYWORD_CONFIDENCE = 0.5;

/**
 * score = (Σ weight per matched keyword) × (matched_count / query_word_count)
 */
function computeConfidence(matched: string[], queryWordCount: number): number {
  if (matched.length === 0 || queryWordCount === 0) return 0;
  const weightedSum = matched.reduce((sum, kw) => sum + (KEYWORD_WEIGHTS.get(kw) ?? 0.5), 0);
  return weightedSum * (matched.length / queryWordCount);
}

/**
 * Compute Levenshtein edit distance between two strings (up to maxDist, then bail early).
 * Used only for long keywords (≥8 chars) to avoid false positives on short words.
 */
function editDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, (prev[j - 1] ?? 0) + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length] ?? maxDist + 1;
}

/**
 * Test whether a keyword pattern matches the query using word-boundary rules.
 * Single-word patterns use \b…\b so that short tokens like "ha", "dsr", "fix"
 * don't fire inside longer words ("that", "understand", "prefix").
 * Multi-word patterns (e.g. "not working") fall back to substring matching
 * because \b doesn't work across spaces in every locale.
 *
 * Typo tolerance: for long keywords (≥8 chars), each query word is also checked
 * with edit distance ≤1. This catches common typos like "kubernete" → "kubernetes".
 */
function keywordMatches(lower: string, pattern: string): boolean {
  if (pattern.includes(" ")) {
    // Multi-word phrase — substring match is fine (specific enough)
    return lower.includes(pattern);
  }
  // Exact word-boundary match (primary path)
  const exactRe = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  if (exactRe.test(lower)) return true;
  // Typo-tolerant path: only for long keywords to avoid false positives on short words
  if (pattern.length >= 8) {
    const queryWords = lower.split(/\s+/).filter(Boolean);
    for (const word of queryWords) {
      if (editDistance(word, pattern, 1) <= 1) return true;
    }
  }
  return false;
}

export function selectSkill(query: string): {
  skillKey: string;
  matchedKeywords: string[];
  confidence: number;
} {
  const lower = query.toLowerCase();
  const queryWordCount = lower.split(/\s+/).filter(Boolean).length;
  let bestKey = "default";
  let bestMatches: string[] = [];
  let bestConfidence = 0;

  for (const [skillKey, patterns] of Object.entries(SKILL_KEYWORDS)) {
    // Only consider skills that are actually loaded
    if (!(skillKey in SKILL_MAP)) continue;
    const matched = patterns.filter((p) => keywordMatches(lower, p));
    const confidence = computeConfidence(matched, queryWordCount);
    if (confidence > bestConfidence) {
      bestKey = skillKey;
      bestMatches = matched;
      bestConfidence = confidence;
    }
  }

  // Reject weak matches — return default so the LLM classifier fires
  if (bestConfidence < MIN_KEYWORD_CONFIDENCE) {
    return { skillKey: "default", matchedKeywords: [], confidence: bestConfidence };
  }

  return { skillKey: bestKey, matchedKeywords: bestMatches, confidence: bestConfidence };
}

export type SkillSelectSource = "keyword" | "llm" | "default";

export interface SelectSkillResult {
  skillKey: string;
  matchedKeywords: string[];
  confidence: number;
  source: SkillSelectSource;
}

/**
 * Async variant of selectSkill. Uses keyword matching first (fast path).
 * When no keywords match, delegates to `classifyFn` — a lightweight LLM
 * classifier injected by the caller — and validates its response against
 * the loaded SKILL_MAP. Degrades gracefully to "default" on error/timeout.
 */
export async function selectSkillAsync(
  query: string,
  classifyFn: (q: string) => Promise<string | null>
): Promise<SelectSkillResult> {
  const { skillKey, matchedKeywords, confidence } = selectSkill(query);

  // Fast path — keyword match cleared the confidence threshold, no LLM needed
  if (skillKey !== "default") {
    return { skillKey, matchedKeywords, confidence, source: "keyword" };
  }

  // Slow path — ask the LLM to classify the query
  try {
    const classified = await classifyFn(query);
    if (classified && classified in SKILL_MAP && classified !== "default") {
      return { skillKey: classified, matchedKeywords: [], confidence: 0, source: "llm" };
    }
  } catch {
    // Non-fatal: fall through to default
  }

  return { skillKey: "default", matchedKeywords: [], confidence, source: "default" };
}

export async function loadSkills(): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  const audit = getAuditLogger();

  for (const dir of skillCandidateDirs()) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      _skillsDir = dir;
      const loadedNames: string[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const stem = entry.name.replace(/\.md$/, "");
        const filePath = path.join(dir, entry.name);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0] ?? "";
          const description = firstLine.replace(/^#\s*/, "").trim() || stem;
          SKILL_MAP[stem] = { name: stem, description, content };
          loadedNames.push(stem);

          // Audit: one event per skill file loaded
          audit.log({
            event: "ai.skill_loaded",
            component: "ai",
            data: {
              name: stem,
              description,
              content_chars: content.length,
              source_path: filePath,
            },
          });
        } catch {
          // skip unreadable files
        }
      }

      // Audit: summary after all skills from this directory are loaded
      audit.log({
        event: "ai.skills_ready",
        component: "ai",
        data: {
          skills_dir: dir,
          count: loadedNames.length,
          skill_names: loadedNames,
        },
      });

      break; // use the first directory that exists
    } catch {
      // directory not found, try next
    }
  }
}

export function getSystemPrompt(skillName?: string): string {
  const skill = SKILL_MAP[skillName ?? "default"] ?? SYSTEM_SKILL;
  return skill.content;
}

/** Resolved directory from which skills were loaded. Empty string before loadSkills() finishes. */
export function getSkillsDir(): string {
  return _skillsDir;
}
