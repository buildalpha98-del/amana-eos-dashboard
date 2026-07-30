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
