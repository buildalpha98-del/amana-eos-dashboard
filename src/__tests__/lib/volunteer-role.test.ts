/**
 * The volunteer role (Daniel, 20 Oct 2026): "my profile, the basic stuff".
 * Compliance, policies, handbook and training — no pay, leave, contracts,
 * timesheets, roster or clock-in, and kept off routine staff emails.
 */
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { canAccessPage, getLandingPage, hasFeature, hasMinRole, isSelfScopedRole } from "@/lib/role-permissions";
import { filterNavItems, VOLUNTEER_NAV_HREFS, navItems } from "@/lib/nav-config";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { inAudience } from "@/lib/staff-updates";
import { assertUserCleared } from "@/lib/induction";
import { getRequiredCertTypes } from "@/lib/cert-requirements";

describe("volunteer pages and features", () => {
  it("gets compliance, profile, policies, training and the handbook", () => {
    for (const p of ["/compliance", "/profile", "/policies", "/my-training", "/notifications", "/handbook"])
      expect(canAccessPage("volunteer", p)).toBe(true);
  });
  it("never pay, leave, contracts, timesheets, roster, services or the dashboard", () => {
    for (const p of ["/my-pay", "/my-leave", "/my-expenses", "/my-contract", "/contracts", "/timesheets", "/roster", "/roster/me", "/my-day", "/services", "/dashboard", "/my-portal"])
      expect(canAccessPage("volunteer", p)).toBe(false);
    for (const f of ["leave.view", "contracts.view", "timesheets.view", "my_portal.view"] as const)
      expect(hasFeature("volunteer", f)).toBe(false);
    expect(hasFeature("volunteer", "compliance.view")).toBe(true);
  });
  it("lands on compliance and never clears a minRole gate", () => {
    expect(getLandingPage("volunteer")).toBe("/compliance");
    expect(hasMinRole("volunteer", "staff")).toBe(false);
  });
  it("is self-scoped like an educator", () => {
    expect(isSelfScopedRole("volunteer")).toBe(true);
    expect(isSelfScopedRole("staff")).toBe(true);
    expect(isSelfScopedRole("member")).toBe(false);
  });
  it("needs a WWCC by default", () => {
    expect(getRequiredCertTypes("volunteer", null)).toEqual(["wwcc"]);
  });
});

describe("volunteer sidebar", () => {
  it("is just their own pages", () => {
    const hrefs = filterNavItems(navItems, "volunteer").map((i) => i.href);
    expect(hrefs).toEqual([...VOLUNTEER_NAV_HREFS]);
  });
});

describe("volunteers aren't bombarded with email", () => {
  it("no email or digest by default", () => {
    expect(getDefaultNotificationPrefs("volunteer")).toMatchObject({ emailNotifications: false, emailDigest: false });
  });
  it("staff emails to 'everyone' skip volunteers; ones addressed to volunteers reach them", () => {
    const v = { id: "v", email: "v@x.test", name: "V", role: "volunteer" as const, serviceIds: ["s1"] };
    expect(inAudience(v, { audienceRoles: [], audienceServiceIds: [] })).toBe(false);
    expect(inAudience(v, { audienceRoles: ["volunteer"], audienceServiceIds: [] })).toBe(true);
    expect(inAudience({ ...v, role: "staff" }, { audienceRoles: [], audienceServiceIds: [] })).toBe(true);
  });
});

describe("volunteers are never rostered", () => {
  it("can't be rostered or clock in, even when cleared", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "cleared",
      inductionGraceUntil: null,
      inductionOverrideUntil: null,
      isCentreAccount: false,
      role: "volunteer",
    });
    await expect(assertUserCleared("v1")).rejects.toThrow(/Volunteers can't be rostered/);
  });
});
