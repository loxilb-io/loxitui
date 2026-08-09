import { getAuditLogger } from "@/audit";
import { type KnowledgeDoc, loadKnowledgeDocs } from "@/knowledge/loader";

/**
 * Pluggable graph-augmented retrieval seam. An external knowledge-graph
 * provider can be injected via setGraphService(); when none is registered,
 * retrieval is keyword-only.
 */
export interface GraphKnowledgeService {
  getGraphKnowledge(query: string): Promise<string>;
}

/**
 * Common English stopwords to filter out during keyword extraction
 */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "must",
  "can",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
]);

/**
 * Graph knowledge service instance, injected via setGraphService().
 * When null, findRelevantKnowledge behaves identically to v2.0 (keyword-only).
 */
let graphService: GraphKnowledgeService | null = null;

/**
 * Inject the graph knowledge service for graph-augmented retrieval.
 * Called once at app startup when graph.enabled=true.
 * When not called, findRelevantKnowledge behaves identically to v2.0.
 */
export function setGraphService(service: GraphKnowledgeService): void {
  graphService = service;
}

/**
 * Extract meaningful keywords from a user query.
 *
 * @param query - User's natural language query
 * @returns Array of lowercase keywords (length > 3, not stopwords)
 *
 * @example
 * extractKeywords("How do I configure Kubernetes LoadBalancer?")
 * // Returns: ["configure", "kubernetes", "loadbalancer"]
 */
export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

interface ScoredDoc {
  doc: KnowledgeDoc;
  score: number; // Number of keyword matches
  density: number; // score / keywords.length (0-1)
}

/**
 * Find knowledge docs relevant to a user query using keyword matching
 * and optional graph-augmented retrieval.
 *
 * When a graph service is injected via setGraphService(), runs graph
 * retrieval in parallel with keyword matching and merges results
 * (graph chunks first, then keyword results, deduplicated).
 *
 * When no graph service is set, produces identical output to v2.0.
 *
 * @param query - User's natural language query
 * @param maxDocs - Maximum number of docs to return (default: 3)
 * @param maxCharsPerDoc - Max characters to include per doc (default: 5000)
 * @returns Markdown string with relevant knowledge docs, or empty string if none match
 */
export async function findRelevantKnowledge(
  query: string,
  maxDocs = 3,
  maxCharsPerDoc = 5000
): Promise<string> {
  const audit = getAuditLogger();

  // Run graph retrieval and keyword retrieval in parallel
  const [graphResult, keywordResult] = await Promise.all([
    graphService ? graphService.getGraphKnowledge(query).catch(() => "") : Promise.resolve(""),
    getKeywordKnowledge(query, maxDocs, maxCharsPerDoc),
  ]);

  // If no graph results, return keyword-only (identical to v2.0 path)
  if (!graphResult) {
    audit.log({
      event: "knowledge.retrieval",
      component: "ai",
      data: {
        path: "keyword-only",
        graph_chars: 0,
        keyword_chars: keywordResult.length,
      },
    });
    return keywordResult;
  }

  // Merge: graph first, then keyword (deduplicated)
  const maxTotal = 12_000;
  let merged = graphResult;

  if (keywordResult && merged.length < maxTotal) {
    // Deduplicate: remove keyword sections whose content overlaps with graph chunks
    const graphLower = graphResult.toLowerCase();
    const keywordSections = keywordResult.split(/(?=### Knowledge: )/);
    const uniqueSections: string[] = [];

    for (const section of keywordSections) {
      if (!section.trim()) continue;
      // Check if a significant portion (first 200 chars) already appears in graph results
      const preview = section
        .slice(0, 200)
        .toLowerCase()
        .replace(/### knowledge: \S+\n/, "");
      if (preview.length > 50 && graphLower.includes(preview.slice(0, 100))) {
        continue;
      }
      uniqueSections.push(section);
    }

    const deduped = uniqueSections.join("\n\n");
    if (deduped) {
      const remaining = maxTotal - merged.length;
      if (remaining > 200) {
        merged += `\n\n${deduped.slice(0, remaining)}`;
      }
    }
  }

  audit.log({
    event: "knowledge.retrieval",
    component: "ai",
    data: {
      path: "graph+keyword",
      graph_chars: graphResult.length,
      keyword_chars: keywordResult.length,
      merged_chars: merged.length,
    },
  });

  return merged;
}

/**
 * Original keyword-matching logic from v2.0.
 * Extracted to a helper so findRelevantKnowledge can call it
 * in parallel with graph retrieval.
 */
async function getKeywordKnowledge(
  query: string,
  maxDocs: number,
  maxCharsPerDoc: number
): Promise<string> {
  const allDocs = await loadKnowledgeDocs();
  if (allDocs.length === 0) return "";

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return "";

  // Score each doc by keyword matches
  const scored: ScoredDoc[] = allDocs.map((doc) => {
    const content = doc.content.toLowerCase();
    const matches = keywords.filter((kw) => content.includes(kw)).length;
    const density = matches / Math.max(keywords.length, 1);
    return { doc, score: matches, density };
  });

  // Sort by score descending, then density descending
  const topDocs = scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.density - a.density;
    })
    .slice(0, maxDocs)
    .filter((x) => x.score > 0); // Skip docs with zero matches

  if (topDocs.length === 0) return "";

  // Format as markdown sections; strip .md/.txt extension from the name
  return topDocs
    .map(({ doc }) => {
      const name = doc.name.replace(/\.(md|txt)$/, "");
      const preview = doc.content.slice(0, maxCharsPerDoc);
      const truncated = doc.content.length > maxCharsPerDoc ? "\n\n[Content truncated]" : "";
      return `### Knowledge: ${name}\n${preview}${truncated}`;
    })
    .join("\n\n");
}

/**
 * Get keyword match statistics for debugging / introspection.
 */
export async function getMatchStats(query: string): Promise<{
  keywords: string[];
  matches: Array<{ name: string; score: number; density: number }>;
}> {
  const allDocs = await loadKnowledgeDocs();
  const keywords = extractKeywords(query);

  const matches = allDocs
    .map((doc) => {
      const content = doc.content.toLowerCase();
      const score = keywords.filter((kw) => content.includes(kw)).length;
      const density = score / Math.max(keywords.length, 1);
      return { name: doc.name.replace(/\.(md|txt)$/, ""), score, density };
    })
    .sort((a, b) => b.score - a.score);

  return { keywords, matches };
}
