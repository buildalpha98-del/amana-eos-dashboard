/**
 * Who may read a colleague's pay, contracted hours, leave balances and
 * payroll link on the staff profile.
 *
 * 2026-09-15: State Managers (head_office) are admin-tier and see every
 * staff member in the org, but must NOT see their remuneration. Before
 * this, `canViewPay` was a bare `isAdmin || isSelf`, so head_office read
 * everything an owner could.
 */
import { describe, it, expect } from "vitest";
import { canViewStaffPay } from "@/lib/staff-pay-visibility";

describe("canViewStaffPay", () => {
  it("lets anyone see their OWN pay, whatever their role", () => {
    for (const role of [
      "owner",
      "head_office",
      "admin",
      "marketing",
      "member",
      "staff",
      "",
      null,
    ]) {
      expect(canViewStaffPay(role, true)).toBe(true);
    }
  });

  it("lets owner and admin see a colleague's pay", () => {
    expect(canViewStaffPay("owner", false)).toBe(true);
    expect(canViewStaffPay("admin", false)).toBe(true);
  });

  it("does NOT let a State Manager see a colleague's pay", () => {
    expect(canViewStaffPay("head_office", false)).toBe(false);
  });

  it("does not let non-admin roles see a colleague's pay", () => {
    for (const role of ["marketing", "member", "staff", "eos_viewer"]) {
      expect(canViewStaffPay(role, false)).toBe(false);
    }
  });

  it("fails closed on a missing role", () => {
    expect(canViewStaffPay(null, false)).toBe(false);
    expect(canViewStaffPay(undefined, false)).toBe(false);
    expect(canViewStaffPay("", false)).toBe(false);
  });
});
