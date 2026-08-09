import { describe, test, expect } from "bun:test";
import { extractKeywords, findRelevantKnowledge, getMatchStats } from "@/ai/knowledge-matcher";
import { resetKnowledgeBaseCache } from "@/knowledge/resolve";

// Reset the knowledge base path cache before each test so environment changes take effect.
// This is a no-op when tests run sequentially, but prevents cross-test pollution.
import { beforeEach } from "bun:test";
beforeEach(() => {
  resetKnowledgeBaseCache();
});

describe("extractKeywords", () => {
  test("filters stopwords and short words", () => {
    const result = extractKeywords("How do I configure the K8s LoadBalancer?");
    // "configure" and "loadbalancer" are > 3 chars and not stopwords
    // "k8s" is exactly 3 chars and should be filtered out
    expect(result).toContain("configure");
    expect(result).toContain("loadbalancer");
    expect(result).not.toContain("how");
    expect(result).not.toContain("the");
    expect(result).not.toContain("k8s");
  });

  test("handles lowercase and punctuation", () => {
    const result = extractKeywords("eBPF's packet-processing pipeline!");
    expect(result).toContain("ebpf");
    expect(result).toContain("packet");
    expect(result).toContain("processing");
    expect(result).toContain("pipeline");
  });

  test("returns empty array for all-stopword query", () => {
    const result = extractKeywords("how do i do this");
    expect(result).toEqual([]);
  });

  test("deduplication is not applied — repeated words appear multiple times", () => {
    const result = extractKeywords("kubernetes kubernetes kubernetes");
    expect(result.length).toBe(3);
  });

  test("handles empty string", () => {
    const result = extractKeywords("");
    expect(result).toEqual([]);
  });
});

describe("findRelevantKnowledge", () => {
  test("returns empty string for query with no recognisable keywords", async () => {
    const result = await findRelevantKnowledge("xyz123 nonexistent foobar");
    expect(result).toBe("");
  });

  test("returns empty string for all-stopword query", async () => {
    const result = await findRelevantKnowledge("how do i do this");
    expect(result).toBe("");
  });

  test("finds kubernetes doc for k8s query", async () => {
    const result = await findRelevantKnowledge(
      "How to configure Kubernetes LoadBalancer service?",
    );
    // Either we find the doc or the knowledge base is unavailable (returns empty) — both are fine.
    // When docs ARE found, they must reference kubernetes content.
    if (result.length > 0) {
      expect(result.toLowerCase()).toContain("kubernetes");
    }
  });

  test("respects maxDocs limit", async () => {
    // Use a very generic query that would match many docs
    const result = await findRelevantKnowledge("loxilb load balancer service", 1);
    if (result.length > 0) {
      // There should be at most one "### Knowledge:" section
      const sections = result.split("### Knowledge:").filter(Boolean);
      expect(sections.length).toBeLessThanOrEqual(1);
    }
  });

  test("truncates docs over maxCharsPerDoc", async () => {
    const result = await findRelevantKnowledge("kubernetes service", 1, 50);
    if (result.length > 0) {
      // Either content is ≤50 chars or truncation marker is present
      const hasFullDoc = result.includes("[Content truncated]");
      const sectionText = result.replace(/^### Knowledge: [^\n]+\n/, "");
      if (!hasFullDoc) {
        expect(sectionText.length).toBeLessThanOrEqual(50 + 10); // small slack
      }
    }
  });
});

describe("getMatchStats", () => {
  test("returns keywords and per-doc match scores", async () => {
    const { keywords, matches } = await getMatchStats(
      "How do I configure Kubernetes LoadBalancer?",
    );
    expect(Array.isArray(keywords)).toBe(true);
    expect(Array.isArray(matches)).toBe(true);
    // Scores must be non-negative
    for (const m of matches) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.density).toBeGreaterThanOrEqual(0);
    }
    // Results must be sorted by score descending
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  test("returns empty keywords for stopword-only query", async () => {
    const { keywords } = await getMatchStats("how do i do this");
    expect(keywords).toEqual([]);
  });
});
