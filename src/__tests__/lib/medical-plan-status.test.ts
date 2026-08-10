import { describe, it, expect } from "vitest";
import { assessPlan, describeIssue } from "@/lib/medical-plan-status";

const NOW = new Date("2026-08-10T00:00:00.000Z");
const daysFromNow = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

/** A plan with nothing wrong with it. */
const healthy = {
  planExpiryDate: daysFromNow(200),
  reviewDueAt: daysFromNow(200),
  developedWithParentAt: daysFromNow(-30),
};

describe("assessPlan — the two independent expiries", () => {
  it("flags an expired practitioner plan", () => {
    // An expired ASCIA plan is not a current medical management plan
    // under Reg 90(1)(c)(i), however recently WE looked at it.
    const s = assessPlan({ ...healthy, planExpiryDate: daysFromNow(-1) }, NOW);
    expect(s.issues).toContain("practitioner_plan_expired");
    expect(s.urgent).toBe(true);
  });

  it("flags a practitioner plan expiring within a month", () => {
    const s = assessPlan({ ...healthy, planExpiryDate: daysFromNow(20) }, NOW);
    expect(s.issues).toContain("practitioner_plan_expiring");
    expect(s.urgent).toBe(false);
  });

  it("flags our own overdue review separately", () => {
    // A service can be diligent and still hold a two-year-old doctor's
    // plan, and vice versa — the remedies differ, so the flags do too.
    const s = assessPlan({ ...healthy, reviewDueAt: daysFromNow(-5) }, NOW);
    expect(s.issues).toContain("service_review_overdue");
    expect(s.issues).not.toContain("practitioner_plan_expired");
    expect(s.urgent).toBe(true);
  });

  it("flags our review coming up", () => {
    const s = assessPlan({ ...healthy, reviewDueAt: daysFromNow(10) }, NOW);
    expect(s.issues).toContain("service_review_due");
    expect(s.urgent).toBe(false);
  });

  it("can report both expiries at once", () => {
    const s = assessPlan(
      { ...healthy, planExpiryDate: daysFromNow(-1), reviewDueAt: daysFromNow(-1) },
      NOW,
    );
    expect(s.issues).toContain("practitioner_plan_expired");
    expect(s.issues).toContain("service_review_overdue");
  });

  it("says nothing about dates that aren't set", () => {
    const s = assessPlan(
      { planExpiryDate: null, reviewDueAt: null, developedWithParentAt: daysFromNow(-1) },
      NOW,
    );
    expect(s.issues).toEqual([]);
    expect(s.ok).toBe(true);
  });
});

describe("assessPlan — parent consultation", () => {
  it("flags a plan with no record of family consultation", () => {
    // Reg 90(1)(c)(ii) requires it, so an absent timestamp is a finding
    // in its own right — reported even when every date is healthy.
    const s = assessPlan({ ...healthy, developedWithParentAt: null }, NOW);
    expect(s.issues).toEqual(["no_parent_consultation"]);
    expect(s.ok).toBe(false);
  });

  it("does not treat it as urgent — it's a gap, not an expiry", () => {
    const s = assessPlan({ ...healthy, developedWithParentAt: null }, NOW);
    expect(s.urgent).toBe(false);
  });

  it("is satisfied by a recorded consultation date", () => {
    expect(assessPlan(healthy, NOW).issues).toEqual([]);
  });
});

describe("assessPlan — a fully healthy plan", () => {
  it("reports ok with no issues", () => {
    const s = assessPlan(healthy, NOW);
    expect(s.ok).toBe(true);
    expect(s.urgent).toBe(false);
    expect(s.issues).toEqual([]);
  });

  it("accepts Date objects as well as strings", () => {
    const s = assessPlan(
      {
        planExpiryDate: new Date(daysFromNow(100)),
        reviewDueAt: new Date(daysFromNow(100)),
        developedWithParentAt: new Date(daysFromNow(-10)),
      },
      NOW,
    );
    expect(s.ok).toBe(true);
  });

  it("treats an unparseable date as not set rather than throwing", () => {
    const s = assessPlan(
      { planExpiryDate: "rubbish", reviewDueAt: null, developedWithParentAt: daysFromNow(-1) },
      NOW,
    );
    expect(s.issues).toEqual([]);
  });
});

describe("describeIssue", () => {
  it("says what to do, not just what's wrong", () => {
    expect(describeIssue("practitioner_plan_expired")).toMatch(
      /ask the family for a current one/i,
    );
    expect(describeIssue("no_parent_consultation")).toMatch(/Reg 90/);
  });

  it("has wording for every issue", () => {
    for (const i of [
      "practitioner_plan_expired",
      "practitioner_plan_expiring",
      "service_review_overdue",
      "service_review_due",
      "no_parent_consultation",
    ] as const) {
      expect(describeIssue(i).length).toBeGreaterThan(10);
    }
  });
});
