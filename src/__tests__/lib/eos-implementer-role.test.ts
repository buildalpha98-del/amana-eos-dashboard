import { describe, it, expect } from "vitest";
import {
  rolePageAccess,
  roleFeatures,
  canAccessPage,
  hasFeature,
  getLandingPage,
} from "@/lib/role-permissions";
import { ROLES, EOS_ROLES, isEosRole } from "@/lib/role-enum";

// 2026-06-23: eos_implementer — write-capable, org-wide, EOS-only role.
// Sibling of the read-only eos_viewer.

describe("getLandingPage", () => {
  it("sends EOS roles to /rocks (not the admin command-centre dashboard)", () => {
    expect(getLandingPage("eos_implementer")).toBe("/rocks");
    expect(getLandingPage("eos_viewer")).toBe("/rocks");
  });

  it("sends every non-EOS role to /dashboard", () => {
    expect(getLandingPage("owner")).toBe("/dashboard");
    expect(getLandingPage("admin")).toBe("/dashboard");
    expect(getLandingPage("marketing")).toBe("/dashboard");
    expect(getLandingPage("member")).toBe("/dashboard");
    expect(getLandingPage("staff")).toBe("/dashboard");
  });

  it("defaults to /dashboard when role is undefined", () => {
    expect(getLandingPage(undefined)).toBe("/dashboard");
  });
});

describe("role-enum EOS helpers", () => {
  it("registers both EOS roles in the runtime ROLES array", () => {
    expect(ROLES).toContain("eos_viewer");
    expect(ROLES).toContain("eos_implementer");
  });

  it("EOS_ROLES contains exactly the two EOS roles", () => {
    expect([...EOS_ROLES].sort()).toEqual(["eos_implementer", "eos_viewer"]);
  });

  it("isEosRole identifies EOS roles only", () => {
    expect(isEosRole("eos_implementer")).toBe(true);
    expect(isEosRole("eos_viewer")).toBe(true);
    expect(isEosRole("admin")).toBe(false);
    expect(isEosRole(null)).toBe(false);
    expect(isEosRole(undefined)).toBe(false);
  });
});

describe("eos_implementer page access", () => {
  it("can reach the full EOS surface", () => {
    for (const page of [
      "/rocks",
      "/vision",
      "/scorecard",
      "/todos",
      "/issues",
      "/meetings",
      "/accountability-chart",
    ]) {
      expect(canAccessPage("eos_implementer", page)).toBe(true);
    }
  });

  it("cannot reach non-EOS sections", () => {
    for (const page of [
      "/financials",
      "/services",
      "/settings",
      "/marketing",
      "/team",
      "/incidents",
      "/leadership",
    ]) {
      expect(canAccessPage("eos_implementer", page)).toBe(false);
    }
  });

  it("does not include any page eos_viewer lacks except /queue", () => {
    const viewer = new Set(rolePageAccess.eos_viewer);
    const extra = rolePageAccess.eos_implementer.filter((p) => !viewer.has(p));
    expect(extra).toEqual(["/queue"]);
  });
});

describe("eos_implementer features (write across EOS)", () => {
  it("has EOS write capabilities", () => {
    for (const f of [
      "rocks.create",
      "rocks.edit",
      "rocks.delete",
      "todos.create",
      "issues.create",
      "meetings.create",
      "scorecard.edit",
    ] as const) {
      expect(hasFeature("eos_implementer", f)).toBe(true);
    }
  });

  it("has no non-EOS capabilities", () => {
    for (const f of [
      "financials.view",
      "marketing.view",
      "users.create",
      "org_settings.edit",
      "team.view",
    ] as const) {
      expect(hasFeature("eos_implementer", f)).toBe(false);
    }
  });

  it("eos_viewer stays read-only (no write features)", () => {
    expect(hasFeature("eos_viewer", "rocks.create")).toBe(false);
    expect(roleFeatures.eos_viewer).toEqual(["my_portal.view"]);
  });
});
