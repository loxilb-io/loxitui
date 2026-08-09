import { describe, expect, it } from "bun:test";
import { TAB_GROUPS, TABS } from "../src/tui/theme";
import { ProviderRegistry } from "../src/ai/provider/registry";
import { DEFAULT_CONFIG } from "../src/config/types";

// ── Tab group navigation integration ────────────────────────────────

describe("Tab group integration", () => {
  it("every TabId is assigned to exactly one group", () => {
    const allGroupTabIds = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
    const flatTabIds = TABS.map((t) => t.id);
    expect(allGroupTabIds.sort()).toEqual(flatTabIds.sort());
  });

  it("all tab IDs in groups are unique (no duplicates)", () => {
    const ids = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ports panel is in network group", () => {
    const netGroup = TAB_GROUPS.find((g) => g.id === "network");
    expect(netGroup).toBeDefined();
    expect(netGroup!.tabs.some((t) => t.id === "ports")).toBe(true);
  });

  it("firewall panel is in security group", () => {
    const secGroup = TAB_GROUPS.find((g) => g.id === "security");
    expect(secGroup).toBeDefined();
    expect(secGroup!.tabs.some((t) => t.id === "firewall")).toBe(true);
  });

  it("at least 3 tab groups exist (overview, network, security)", () => {
    expect(TAB_GROUPS.length).toBeGreaterThanOrEqual(3);
    const groupIds = TAB_GROUPS.map((g) => g.id);
    expect(groupIds).toContain("overview");
    expect(groupIds).toContain("network");
    expect(groupIds).toContain("security");
  });

  it("each group has a non-empty label", () => {
    for (const g of TAB_GROUPS) {
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});

// ── Provider registry integration ───────────────────────────────────

describe("Provider registry integration", () => {
  it("defaults to claude-cli provider", async () => {
    const reg = new ProviderRegistry();
    const provider = await reg.createDefault({
      provider: "",
      model: "",
      api_key: "",
      base_url: "",
      knowledge_base_path: "",
      max_history_turns: 10,
      summary_threshold: 0.7,
    });
    expect(provider.meta.id).toBe("claude-cli");
    expect(provider.meta.requiresApiKey).toBe(false);
  });

  it("routes ollama config to OllamaProvider", async () => {
    const reg = new ProviderRegistry();
    const provider = await reg.createDefault({
      provider: "ollama",
      model: "llama3.2",
      api_key: "",
      base_url: "http://localhost:11434",
      knowledge_base_path: "",
      max_history_turns: 10,
      summary_threshold: 0.7,
    });
    expect(provider.meta.id).toBe("ollama");
  });

  it("claude-cli provider has validate method", async () => {
    const reg = new ProviderRegistry();
    const provider = await reg.createDefault({
      provider: "claude-cli",
      model: "",
      api_key: "",
      base_url: "",
      knowledge_base_path: "",
      max_history_turns: 10,
      summary_threshold: 0.7,
    });
    expect(typeof provider.validate).toBe("function");
  });
});

// ── Config defaults integration ─────────────────────────────────────

describe("Config defaults integration", () => {
  it("default provider is claude-cli", () => {
    expect(DEFAULT_CONFIG.ai.provider).toBe("claude-cli");
  });

  it("api_key defaults to empty string (not required)", () => {
    expect(DEFAULT_CONFIG.ai.api_key).toBe("");
  });
});
