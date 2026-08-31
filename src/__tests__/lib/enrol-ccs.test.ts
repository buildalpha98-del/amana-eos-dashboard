import { describe, it, expect } from "vitest";
import { ccsPrompt, ccsAnswered } from "@/lib/enrol-ccs";

describe("ccsPrompt", () => {
  it("says nothing before they've answered", () => {
    const p = ccsPrompt({ approved: null, applied: null });
    expect(p.tone).toBe("none");
    expect(p.askApplied).toBe(false);
  });

  it("says nothing when the subsidy is already approved", () => {
    const p = ccsPrompt({ approved: "yes", applied: null });
    expect(p.tone).toBe("none");
    expect(p.askApplied).toBe(false);
  });

  it("asks whether they've applied once they say not approved", () => {
    const p = ccsPrompt({ approved: "no", applied: null });
    expect(p.askApplied).toBe(true);
    expect(p.tone).toBe("none"); // question first, prompt after they answer
  });

  it("reassures when they've applied and explains the ~2 week wait", () => {
    const p = ccsPrompt({ approved: "no", applied: "yes" });
    expect(p.tone).toBe("info");
    expect(p.body).toMatch(/two weeks/i);
    expect(p.actionHref).toBeNull();
  });

  it("pushes them to apply when they haven't", () => {
    const p = ccsPrompt({ approved: "no", applied: "no" });
    expect(p.tone).toBe("action");
    expect(p.title).toMatch(/apply/i);
    expect(p.body).toMatch(/3 Day Guarantee/i);
    expect(p.body).toMatch(/both parents are working/i);
    expect(p.actionHref).toContain("servicesaustralia.gov.au");
  });
});

describe("ccsAnswered — the prompt urges, it never blocks", () => {
  it("is incomplete until the first question is answered", () => {
    expect(ccsAnswered({ approved: null, applied: null })).toBe(false);
  });

  it("is complete when approved", () => {
    expect(ccsAnswered({ approved: "yes", applied: null })).toBe(true);
  });

  it("needs the follow-up when not approved", () => {
    expect(ccsAnswered({ approved: "no", applied: null })).toBe(false);
  });

  it("lets a parent who has NOT applied continue anyway", () => {
    // The whole point: blocking on an external government process would
    // cost us the enrolment.
    expect(ccsAnswered({ approved: "no", applied: "no" })).toBe(true);
  });
});
