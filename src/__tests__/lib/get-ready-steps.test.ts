import { describe, it, expect } from "vitest";
import { buildGetReadySteps, type GetReadyInput } from "@/lib/get-ready-steps";

const base = (over: Partial<GetReadyInput["readiness"]> = {}): GetReadyInput["readiness"] => ({
  status: "new_starter",
  blockers: [],
  practical: [],
  practicalAllSigned: false,
  ...over,
});

const keys = (input: GetReadyInput) => buildGetReadySteps(input).map((s) => s.key);
const step = (input: GetReadyInput, key: string) =>
  buildGetReadySteps(input).find((s) => s.key === key);

describe("buildGetReadySteps", () => {
  it("a brand-new starter sees every step, in order, none done", () => {
    const input: GetReadyInput = {
      readiness: base({
        blockers: [
          { kind: "profile", label: "Profile incomplete" },
          { kind: "wwcc", label: "WWCC not uploaded" },
          { kind: "policies", label: "2 policy acknowledgements outstanding" },
          { kind: "courses", label: "3 training courses left" },
        ],
        practical: [{}],
      }),
      contract: { acknowledgedByStaff: false },
      hasTraining: false,
    };
    const steps = buildGetReadySteps(input);
    expect(steps.map((s) => s.key)).toEqual([
      "contract", "details", "wwcc", "policies", "training", "practical",
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(step(input, "training")?.hint).toBe("3 training courses left");
  });

  it("a cleared blocker reads as done", () => {
    const input: GetReadyInput = {
      readiness: base({ blockers: [{ kind: "wwcc", label: "x" }] }),
      contract: { acknowledgedByStaff: true },
      hasTraining: false,
    };
    expect(step(input, "details")?.done).toBe(true);
    expect(step(input, "wwcc")?.done).toBe(false);
    expect(step(input, "contract")?.done).toBe(true);
  });

  it("a new starter without a contract waits on it rather than being sent nowhere", () => {
    const s = step({ readiness: base(), contract: null, hasTraining: false }, "contract");
    expect(s?.waiting).toBe(true);
    expect(s?.href).toBeUndefined();
  });

  it("long-standing staff are not nagged about a contract or practical that never existed", () => {
    const k = keys({
      readiness: base({ status: "cleared", practical: [{}] }),
      contract: null,
      hasTraining: false,
    });
    expect(k).not.toContain("contract");
    expect(k).not.toContain("practical");
  });

  it("training only appears when there is training to do or done", () => {
    expect(keys({ readiness: base(), contract: null, hasTraining: false })).not.toContain("training");
    expect(step({ readiness: base(), contract: null, hasTraining: true }, "training")?.done).toBe(true);
  });

  it("every actionable step links somewhere a locked starter can reach", () => {
    const steps = buildGetReadySteps({
      readiness: base({ blockers: [{ kind: "courses", label: "1 left" }] }),
      contract: { acknowledgedByStaff: false },
      hasTraining: true,
    });
    for (const s of steps.filter((x) => !x.waiting)) {
      expect(s.href, s.key).toMatch(/^\/(my-contract|profile|compliance|policies|my-training)$/);
    }
  });
});
