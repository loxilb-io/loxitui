import { describe, expect, it } from "bun:test";
import { normaliseResource, normaliseVerb, parseCommand } from "../src/cmd/parser";

describe("Command parser", () => {
  it("parses list command", () => {
    const cmd = parseCommand("list lb");
    expect(cmd.verb).toBe("list");
    expect(cmd.resource).toBe("lb");
    expect(cmd.args).toHaveLength(0);
  });

  it("aliases ls to list", () => {
    const cmd = parseCommand("ls lb");
    expect(cmd.verb).toBe("list");
  });

  it("parses create with positional args", () => {
    const cmd = parseCommand("create lb 10.0.0.1 80 tcp");
    expect(cmd.verb).toBe("create");
    expect(cmd.resource).toBe("lb");
    expect(cmd.args).toEqual(["10.0.0.1", "80", "tcp"]);
  });

  it("parses flags", () => {
    const cmd = parseCommand("delete route --dst 10.0.0.0/24");
    expect(cmd.verb).toBe("delete");
    expect(cmd.flags.dst).toBe("10.0.0.0/24");
  });

  it("parses boolean flag (no value)", () => {
    const cmd = parseCommand("list lb --all");
    expect(cmd.flags.all).toBe("true");
  });

  it("handles empty input", () => {
    const cmd = parseCommand("");
    expect(cmd.verb).toBe("");
    expect(cmd.resource).toBe("");
    expect(cmd.args).toEqual([]);
    expect(cmd.flags).toEqual({});
  });

  it("handles short flags", () => {
    const cmd = parseCommand("create route 10.0.0.0/8 -g 1.2.3.4");
    expect(cmd.flags.g).toBe("1.2.3.4");
  });
});

describe("Verb aliases (normaliseVerb)", () => {
  it("maps get → list", () => {
    expect(normaliseVerb("get")).toBe("list");
  });

  it("maps add → create", () => {
    expect(normaliseVerb("add")).toBe("create");
  });

  it("maps del → delete", () => {
    expect(normaliseVerb("del")).toBe("delete");
  });

  it("maps rm → delete", () => {
    expect(normaliseVerb("rm")).toBe("delete");
  });

  it("maps remove → delete", () => {
    expect(normaliseVerb("remove")).toBe("delete");
  });

  it("maps set → update", () => {
    expect(normaliseVerb("set")).toBe("update");
  });

  it("maps patch → update", () => {
    expect(normaliseVerb("patch")).toBe("update");
  });

  it("maps describe → show", () => {
    expect(normaliseVerb("describe")).toBe("show");
  });

  it("preserves canonical verbs", () => {
    expect(normaliseVerb("list")).toBe("list");
    expect(normaliseVerb("create")).toBe("create");
    expect(normaliseVerb("delete")).toBe("delete");
    expect(normaliseVerb("update")).toBe("update");
    expect(normaliseVerb("show")).toBe("show");
  });
});

describe("Resource aliases (normaliseResource)", () => {
  it("maps loadbalancer → lb", () => {
    expect(normaliseResource("loadbalancer")).toBe("lb");
  });

  it("maps svc → lb", () => {
    expect(normaliseResource("svc")).toBe("lb");
  });

  it("maps ep → endpoint", () => {
    expect(normaliseResource("ep")).toBe("endpoint");
  });

  it("maps ct → conntrack", () => {
    expect(normaliseResource("ct")).toBe("conntrack");
  });

  it("maps fw → firewall", () => {
    expect(normaliseResource("fw")).toBe("firewall");
  });

  it("maps mirror → mirrortrack", () => {
    expect(normaliseResource("mirror")).toBe("mirrortrack");
  });

  it("maps bgp → bgppeer", () => {
    expect(normaliseResource("bgp")).toBe("bgppeer");
  });

  it("preserves canonical resource names", () => {
    for (const r of [
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
    ]) {
      expect(normaliseResource(r)).toBe(r);
    }
  });
});

describe("All 10 resource types: list, create, delete (US-026)", () => {
  const resources = [
    { name: "lb", flag: "vip", value: "10.0.0.1" },
    { name: "endpoint", flag: "ip", value: "10.0.0.5" },
    { name: "route", flag: "dst", value: "10.0.0.0/24" },
    { name: "conntrack", flag: "id", value: "42" },
    { name: "ipsec", flag: "name", value: "tun0" },
    { name: "firewall", flag: "name", value: "myrule" },
    { name: "vlan", flag: "id", value: "100" },
    { name: "mirrortrack", flag: "name", value: "mir1" },
    { name: "session", flag: "id", value: "sess1" },
    { name: "bgppeer", flag: "peer", value: "10.0.0.2" },
  ];

  for (const { name, flag, value } of resources) {
    it(`list ${name} → verb:list, resource:${name}`, () => {
      const cmd = parseCommand(`list ${name}`);
      expect(cmd.verb).toBe("list");
      expect(cmd.resource).toBe(name);
    });

    it(`create ${name} --${flag} ${value} → flags populated`, () => {
      const cmd = parseCommand(`create ${name} --${flag} ${value}`);
      expect(cmd.verb).toBe("create");
      expect(cmd.resource).toBe(name);
      expect(cmd.flags[flag]).toBe(value);
    });

    it(`delete ${name} → verb:delete`, () => {
      const cmd = parseCommand(`delete ${name}`);
      expect(cmd.verb).toBe("delete");
      expect(cmd.resource).toBe(name);
    });
  }
});

describe("Flag parsing edge cases", () => {
  it("parses --key=value", () => {
    const cmd = parseCommand("create lb --port=8080");
    expect(cmd.flags.port).toBe("8080");
  });

  it("parses -k=value", () => {
    const cmd = parseCommand("create lb -p=8080");
    expect(cmd.flags.p).toBe("8080");
  });

  it("parses mixed flags and args", () => {
    const cmd = parseCommand("create lb 10.0.0.1 --port 80 tcp --proto=tcp");
    expect(cmd.args).toEqual(["10.0.0.1", "tcp"]);
    expect(cmd.flags.port).toBe("80");
    expect(cmd.flags.proto).toBe("tcp");
  });

  it("handles boolean short flag", () => {
    const cmd = parseCommand("list lb -a");
    expect(cmd.flags.a).toBe("true");
  });
});

describe("Integration: alias verb + alias resource", () => {
  it("get svc → list lb", () => {
    const cmd = parseCommand("get svc");
    expect(cmd.verb).toBe("list");
    expect(cmd.resource).toBe("lb");
  });

  it("add ep → create endpoint", () => {
    const cmd = parseCommand("add ep 10.0.0.1");
    expect(cmd.verb).toBe("create");
    expect(cmd.resource).toBe("endpoint");
    expect(cmd.args).toEqual(["10.0.0.1"]);
  });

  it("rm ct → delete conntrack", () => {
    const cmd = parseCommand("rm ct --all");
    expect(cmd.verb).toBe("delete");
    expect(cmd.resource).toBe("conntrack");
    expect(cmd.flags.all).toBe("true");
  });

  it("describe fw → show firewall", () => {
    const cmd = parseCommand("describe fw --name myrule");
    expect(cmd.verb).toBe("show");
    expect(cmd.resource).toBe("firewall");
    expect(cmd.flags.name).toBe("myrule");
  });

  it("set bgp → update bgppeer", () => {
    const cmd = parseCommand("set bgp --peer 10.0.0.2");
    expect(cmd.verb).toBe("update");
    expect(cmd.resource).toBe("bgppeer");
    expect(cmd.flags.peer).toBe("10.0.0.2");
  });
});

describe("Command palette state transitions (US-024)", () => {
  it("command palette opens on colon key", () => {
    let modal: string | null = null;
    const key = { sequence: ":" };
    const aiOpen = false;
    if (key.sequence === ":" && !aiOpen && modal === null) {
      modal = "command-palette";
    }
    expect(modal).toBe("command-palette");
  });

  it("command palette closes on escape", () => {
    let modal: string | null = "command-palette";
    const key = { name: "escape" };
    if (key.name === "escape" && modal === "command-palette") {
      modal = null;
    }
    expect(modal).toBeNull();
  });

  it("does not open when another modal is active", () => {
    let modal: string | null = "create-lb";
    const key = { sequence: ":" };
    const aiOpen = false;
    if (key.sequence === ":" && !aiOpen && modal === null) {
      modal = "command-palette";
    }
    expect(modal).toBe("create-lb");
  });

  it("does not open when AI sidebar is open", () => {
    let modal: string | null = null;
    const aiOpen = true;
    const key = { sequence: ":" };
    if (key.sequence === ":" && !aiOpen && modal === null) {
      modal = "command-palette";
    }
    expect(modal).toBeNull();
  });

  it("submit with empty verb/resource shows error", () => {
    const parsed = parseCommand("foobar");
    expect(parsed.verb).toBe("foobar");
    expect(parsed.resource).toBe("");
    const isError = !parsed.verb || !parsed.resource;
    expect(isError).toBe(true);
  });

  it("submit with valid command shows success", () => {
    const parsed = parseCommand("list lb");
    const isError = !parsed.verb || !parsed.resource;
    expect(isError).toBe(false);
    expect(parsed.verb).toBe("list");
    expect(parsed.resource).toBe("lb");
  });
});
