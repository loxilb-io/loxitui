import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Candidate locations for loxilb-knowledge/, searched in order.
 * Allows the TUI to find the knowledge base whether running from source,
 * an extracted binary, or a development checkout.
 */
function candidatePaths(): string[] {
  // Directory of the compiled/running script (when bundled, this is the binary dir)
  const scriptDir = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  })();

  return [
    // 1. Explicitly set via env var
    process.env.LOXILB_KNOWLEDGE_PATH ?? "",
    // 2. Adjacent to the script / binary
    path.join(scriptDir, "loxilb-knowledge"),
    path.join(scriptDir, "..", "loxilb-knowledge"),
    path.join(scriptDir, "..", "..", "loxilb-knowledge"),
    // 3. Within the monorepo root (dev mode)
    path.join(process.cwd(), "loxilb-knowledge"),
    path.join(process.cwd(), "..", "loxilb-knowledge"),
    // 4. Installed under XDG data dir
    path.join(
      process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? "~", ".local", "share"),
      "loxitui",
      "loxilb-knowledge"
    ),
  ].filter(Boolean);
}

let _resolved: string | null | undefined = undefined;

export async function resolveKnowledgeBase(): Promise<string | null> {
  if (_resolved !== undefined) return _resolved;
  for (const candidate of candidatePaths()) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        _resolved = candidate;
        return _resolved;
      }
    } catch {
      // not found, try next
    }
  }
  _resolved = null;
  return null;
}

export function resetKnowledgeBaseCache(): void {
  _resolved = undefined;
}
