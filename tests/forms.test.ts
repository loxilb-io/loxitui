import { describe, expect, it } from "bun:test";
import { lbServiceFormSchema } from "../src/tui/forms/validation";

const LB = {
  externalIP: "10.0.0.1",
  port: 80,
  protocol: "tcp",
  endpoints: [{ endpointIP: "10.0.0.2", targetPort: 8080 }],
};

describe("LB service form", () => {
  it("accepts NAT modes 0-5 and refuses the retired mode 6 (aigw)", () => {
    for (const mode of [0, 5]) {
      expect(lbServiceFormSchema.safeParse({ ...LB, mode }).success).toBe(true);
    }
    expect(lbServiceFormSchema.safeParse({ ...LB, mode: 6 }).success).toBe(false);
  });
});
