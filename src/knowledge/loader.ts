import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveKnowledgeBase } from "./resolve";

export interface KnowledgeDoc {
  name: string;
  path: string;
  content: string;
}

/** Load all markdown files from the knowledge base root */
export async function loadKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const base = await resolveKnowledgeBase();
  if (!base) return [];

  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    const docs: KnowledgeDoc[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt")) continue;
      const fullPath = path.join(base, entry.name);
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        docs.push({ name: entry.name, path: fullPath, content });
      } catch {
        // skip unreadable files
      }
    }
    return docs;
  } catch {
    return [];
  }
}

/** Load a single named document (stem, no extension needed) */
export async function loadDoc(stem: string): Promise<string | null> {
  const base = await resolveKnowledgeBase();
  if (!base) return null;

  for (const ext of [".md", ".txt", ""]) {
    try {
      const content = await fs.readFile(path.join(base, stem + ext), "utf-8");
      return content;
    } catch {
      // try next extension
    }
  }
  return null;
}
