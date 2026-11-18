import { describe, expect, it } from "bun:test";
import type { DetailField } from "../src/tui/components/DetailPane";
import {
  jwtAuthProfileFields,
  modelProfileFields,
  netIdentityFields,
  netIdentityMatch,
  objectiveFields,
} from "../src/tui/panels/detail-fields";

function field(fields: DetailField[], label: string): string | undefined {
  return fields.find((f) => f.label === label)?.value;
}

describe("AI gateway detail fields", () => {
  it("objectiveFields derives the request class from the priority sign", () => {
    expect(field(objectiveFields({ name: "a", priority: 5 }), "Class")).toBe("critical");
    expect(field(objectiveFields({ name: "b", priority: -1 }), "Class")).toBe("sheddable");
    const unset = objectiveFields({ name: "c" });
    expect(field(unset, "Priority")).toBe("0");
    expect(field(unset, "Class")).toBe("standard");
    expect(field(unset, "Services")).toBe("all");
  });

  it("netIdentityMatch renders the single match key", () => {
    expect(netIdentityMatch({ cidr: ["10.0.0.0/8", "10.1.0.0/16"] })).toBe(
      "cidr=10.0.0.0/8,10.1.0.0/16"
    );
    expect(netIdentityMatch({ vlan: 100 })).toBe("vlan=100");
    expect(netIdentityMatch({})).toBe("—");
  });

  it("netIdentityFields shows what the gateway applies to unset fields", () => {
    const fields = netIdentityFields({ name: "lab", match: { ingress_if: "eth1" }, tenant: "t1" });
    expect(field(fields, "Match")).toBe("ingress_if=eth1");
    expect(field(fields, "Services")).toBe("all");
    expect(field(fields, "Models")).toBe("any");
    expect(field(fields, "Enforce")).toBe("advisory");
    expect(field(fields, "Credential")).toBe("none");
    expect(field(fields, "Class")).toBe("standard");
    expect(field(fields, "Fail Mode")).toBe("neutral");
  });

  it("modelProfileFields joins renderer engine and version", () => {
    const fields = modelProfileFields({
      profileId: "qwen3",
      gen: 3,
      baseModel: "Qwen/Qwen3-32B",
      aliasPolicy: "base_model_only",
      supportedApis: ["completions", "chat"],
      tokenizerSha256: "abc",
      rendererEngine: "vllm",
      rendererVersion: "0.9.1",
    });
    expect(field(fields, "Generation")).toBe("3");
    expect(field(fields, "APIs")).toBe("completions, chat");
    expect(field(fields, "Renderer")).toBe("vllm 0.9.1");
    expect(field(fields, "Oracle")).toBe("—");
  });

  it("jwtAuthProfileFields shows the default for a zero or unset field", () => {
    const fields = jwtAuthProfileFields({ name: "idp", issuer: "https://idp", leeway_sec: 0 });
    expect(field(fields, "Leeway")).toBe("30s");
    expect(field(fields, "Refresh")).toBe("3600s");
    expect(field(fields, "Algorithms")).toBe("RS256, ES256");
    expect(field(fields, "Class")).toBe("no cap");
    const set = jwtAuthProfileFields({ name: "idp", issuer: "https://idp", leeway_sec: 5 });
    expect(field(set, "Leeway")).toBe("5s");
  });
});
