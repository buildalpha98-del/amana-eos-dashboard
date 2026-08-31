import { describe, it, expect } from "vitest";
import {
  getParentEnrolmentState,
  canAccessPortal,
  canBook,
} from "@/lib/parent-enrolment-state";

describe("getParentEnrolmentState", () => {
  it("is needs_enrolment with no enrolments at all", () => {
    expect(getParentEnrolmentState([])).toBe("needs_enrolment");
    expect(getParentEnrolmentState(null)).toBe("needs_enrolment");
    expect(getParentEnrolmentState(undefined)).toBe("needs_enrolment");
  });

  it("is needs_enrolment when only a draft exists — a draft isn't submitted", () => {
    expect(getParentEnrolmentState([{ status: "draft" }])).toBe("needs_enrolment");
  });

  it("is pending_review once submitted", () => {
    expect(getParentEnrolmentState([{ status: "submitted" }])).toBe("pending_review");
  });

  it("is active once staff approve", () => {
    expect(getParentEnrolmentState([{ status: "approved" }])).toBe("active");
  });

  it("a declined enrolment routes them back to the form, not a dead end", () => {
    expect(getParentEnrolmentState([{ status: "declined" }])).toBe("needs_enrolment");
  });

  it("one approved child keeps the portal open while a sibling is pending", () => {
    // Otherwise adding a second child would silently revoke booking for the first.
    expect(
      getParentEnrolmentState([{ status: "approved" }, { status: "submitted" }]),
    ).toBe("active");
  });
});

describe("permissions", () => {
  it("locks everything but the form until submitted", () => {
    expect(canAccessPortal("needs_enrolment")).toBe(false);
    expect(canBook("needs_enrolment")).toBe(false);
  });

  it("opens the portal on submission but NOT booking", () => {
    // The specific rule Daniel asked for: they can look around while
    // staff check the details, they just can't book yet.
    expect(canAccessPortal("pending_review")).toBe(true);
    expect(canBook("pending_review")).toBe(false);
  });

  it("unlocks booking only after approval", () => {
    expect(canAccessPortal("active")).toBe(true);
    expect(canBook("active")).toBe(true);
  });
});

describe("status vocabulary matches what the API actually writes", () => {
  // Regression, 2026-07-31. PATCH /api/enrolments/[id] writes "processed"
  // on approval (and activates the children), but this module only knew
  // "approved"/"active" — so approving a family left them in
  // needs_enrolment, locked out of the booking their approval was
  // supposed to unlock.
  it("treats 'processed' as approved", () => {
    expect(getParentEnrolmentState([{ status: "processed" }])).toBe("active");
  });

  it("treats 'under_review' as pending, not unknown", () => {
    expect(getParentEnrolmentState([{ status: "under_review" }])).toBe(
      "pending_review",
    );
  });

  it("routes rejected and archived back to the form", () => {
    expect(getParentEnrolmentState([{ status: "rejected" }])).toBe(
      "needs_enrolment",
    );
    expect(getParentEnrolmentState([{ status: "archived" }])).toBe(
      "needs_enrolment",
    );
  });

  it("lets one processed child open the portal while a sibling is pending", () => {
    expect(
      getParentEnrolmentState([
        { status: "submitted" },
        { status: "processed" },
      ]),
    ).toBe("active");
  });
});
