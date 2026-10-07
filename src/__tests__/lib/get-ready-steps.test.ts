import { describe, it, expect } from "vitest";
import { buildGetReadySteps, type GetReadyInput } from "@/lib/get-ready-steps";

function input(over: Partial<GetReadyInput> = {}): GetReadyInput {
  return {
    status: "new_starter",
    contract: { acknowledgedByStaff: false },
    details: { missing: [] },
    payroll: { applicable: true, linked: true, complete: true },
    documents: { missing: [] },
    reading: { handbook: true, amanaWay: true },
    keyPolicies: { total: 0, outstanding: [] },
    training: { total: 0, remaining: 0 },
    practical: { items: 0, allSigned: false },
    ...over,
  };
}
const step = (i: GetReadyInput, key: string) => buildGetReadySteps(i).find((s) => s.key === key);

describe("buildGetReadySteps", () => {
  it("a brand-new starter sees every step, in order, none done", () => {
    const steps = buildGetReadySteps(
      input({
        details: { missing: ["a profile photo", "an emergency contact"] },
        payroll: { applicable: true, linked: false, complete: false },
        documents: { missing: ["Working With Children Check", "First Aid"] },
        reading: { handbook: false, amanaWay: false },
        keyPolicies: { total: 2, outstanding: ["Code of Conduct Policy", "Privacy and Confidentiality Policy"] },
        training: { total: 8, remaining: 8 },
        practical: { items: 6, allSigned: false },
      }),
    );
    expect(steps.map((s) => s.key)).toEqual([
      "contract", "details", "documents", "reading", "policies", "training", "practical",
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  describe("details include payroll (bank, super, tax via Employment Hero)", () => {
    it("isn't done until Employment Hero setup is complete", () => {
      const s = step(input({ payroll: { applicable: true, linked: true, complete: false } }), "details");
      expect(s?.done).toBe(false);
      expect(s?.hint).toMatch(/tax file declaration, bank and super/);
      expect(s?.href).toBe("/profile#payroll");
    });

    it("lists personal and payroll gaps together", () => {
      const s = step(
        input({
          details: { missing: ["your phone number"] },
          payroll: { applicable: true, linked: false, complete: false },
        }),
        "details",
      );
      expect(s?.hint).toMatch(/^Still needed: your phone number and your bank, super and tax/);
      expect(s?.href).toBe("/profile");
    });

    it("ignores payroll when Employment Hero isn't connected", () => {
      expect(step(input({ payroll: { applicable: false, linked: false, complete: false } }), "details")?.done).toBe(true);
    });
  });

  it("documents covers every required certificate, not just the WWCC", () => {
    const s = step(input({ documents: { missing: ["First Aid", "CPR"] } }), "documents");
    expect(s?.label).toBe("Upload your compliance documents");
    expect(s?.hint).toBe("Still needed: First Aid and CPR");
    expect(s?.done).toBe(false);
  });

  describe("reading", () => {
    it("asks for the Staff Handbook and The Amana Way", () => {
      const s = step(input({ reading: { handbook: false, amanaWay: false } }), "reading");
      expect(s?.done).toBe(false);
      expect(s?.hint).toBe("Still to read: the Staff Handbook and The Amana Way");
      expect(s?.href).toBe("/tools/handbook");
    });

    it("sends them to The Amana Way once the handbook is done", () => {
      expect(step(input({ reading: { handbook: true, amanaWay: false } }), "reading")?.href).toBe(
        "/tools/the-amana-way",
      );
    });

    // The bug Daniel hit: "Read and sign two policies" showed ticked on an
    // account that had signed nothing, because the policies didn't exist.
    it("is not done until both are read", () => {
      const s = step(input({ reading: { handbook: false, amanaWay: true } }), "reading");
      expect(s?.done).toBe(false);
    });
  });

  describe("key policies", () => {
    it("asks for each unsigned key policy by name and links My Training", () => {
      const s = step(
        input({ keyPolicies: { total: 2, outstanding: ["Privacy and Confidentiality Policy"] } }),
        "policies",
      );
      expect(s?.label).toBe("Sign the 2 key policies");
      expect(s?.done).toBe(false);
      expect(s?.hint).toMatch(/^Still to sign: Privacy and Confidentiality Policy/);
      expect(s?.href).toBe("/my-training#key-policies");
    });

    it("is done once all are signed", () => {
      expect(step(input({ keyPolicies: { total: 2, outstanding: [] } }), "policies")?.done).toBe(true);
    });

    // The bug Daniel hit: "Read and sign two policies" showed ticked on an
    // account that had signed nothing, because the policies didn't exist.
    it("is hidden — never ticked — when there are no key policies at all", () => {
      expect(step(input({ keyPolicies: { total: 0, outstanding: [] } }), "policies")).toBeUndefined();
    });
  });

  it("training counts down and links to My Training", () => {
    const s = step(input({ training: { total: 8, remaining: 3 } }), "training");
    expect(s?.hint).toBe("3 of 8 courses left");
    expect(s?.href).toBe("/my-training");
  });

  it("training only appears when there are essential courses", () => {
    expect(step(input({ training: { total: 0, remaining: 0 } }), "training")).toBeUndefined();
  });

  it("a new starter without a contract waits on it rather than being sent nowhere", () => {
    const s = step(input({ contract: null }), "contract");
    expect(s?.waiting).toBe(true);
    expect(s?.href).toBeUndefined();
  });

  it("long-standing staff aren't nagged about a contract or practical that never existed", () => {
    const keys = buildGetReadySteps(
      input({ status: "cleared", contract: null, practical: { items: 6, allSigned: false } }),
    ).map((s) => s.key);
    expect(keys).not.toContain("contract");
    expect(keys).not.toContain("practical");
  });

  it("every actionable step links somewhere a starter can reach", () => {
    const steps = buildGetReadySteps(
      input({
        details: { missing: ["a profile photo"] },
        documents: { missing: ["CPR"] },
        reading: { handbook: false, amanaWay: false },
        keyPolicies: { total: 1, outstanding: ["Code of Conduct Policy"] },
        training: { total: 2, remaining: 2 },
      }),
    );
    for (const s of steps.filter((x) => !x.waiting)) {
      expect(s.href, s.key).toMatch(/^\/(my-contract|profile(#payroll)?|compliance|tools\/handbook|tools\/the-amana-way|my-training(#key-policies)?)$/);
    }
  });
});
