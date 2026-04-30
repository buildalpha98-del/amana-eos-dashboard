import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import {
  ROLE_DISPLAY_NAMES,
  roleFromDisplayName,
  rolePageAccess,
  roleFeatures,
  canAccessPage,
  getAccessiblePages,
  hasFeature,
  hasMinRole,
  parseRole,
  permissionsTable,
  allPages,
} from "@/lib/role-permissions";

// ── All 6 roles (post-2026-04-30 coordinator-collapse) ─────

const ALL_ROLES: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
];

// ── 1. ROLE_DISPLAY_NAMES ─────────────────────────────────

describe("ROLE_DISPLAY_NAMES", () => {
  it("maps every role to a display name", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_DISPLAY_NAMES[role]).toBeDefined();
      expect(typeof ROLE_DISPLAY_NAMES[role]).toBe("string");
    }
  });

  // 2026-04-30: coordinator collapsed into member (Director of Service);
  // "Centre Director" label retired. The 7-role display table is now 6.
  it("has correct display names", () => {
    expect(ROLE_DISPLAY_NAMES.owner).toBe("Owner");
    expect(ROLE_DISPLAY_NAMES.head_office).toBe("State Manager");
    expect(ROLE_DISPLAY_NAMES.admin).toBe("Admin");
    expect(ROLE_DISPLAY_NAMES.marketing).toBe("Marketing");
    expect(ROLE_DISPLAY_NAMES.member).toBe("Director of Service");
    expect(ROLE_DISPLAY_NAMES.staff).toBe("Educator");
  });
});

describe("roleFromDisplayName", () => {
  it("resolves display names back to role keys (case-insensitive)", () => {
    expect(roleFromDisplayName("Owner")).toBe("owner");
    expect(roleFromDisplayName("state manager")).toBe("head_office");
    expect(roleFromDisplayName("EDUCATOR")).toBe("staff");
  });

  it("returns undefined for unknown names", () => {
    expect(roleFromDisplayName("superadmin")).toBeUndefined();
    expect(roleFromDisplayName("")).toBeUndefined();
  });
});

// ── 2. Page-level access ──────────────────────────────────

describe("rolePageAccess", () => {
  it("owner has access to all pages", () => {
    expect(rolePageAccess.owner).toEqual(allPages);
  });

  // 2026-04-30: head_office (State Manager) lost /leadership per the
  // training-session feedback — Leadership is HQ-cockpit (owner + admin)
  // only, not a per-state concern.
  it("head_office can access everything except /leadership", () => {
    expect(rolePageAccess.head_office).not.toContain("/leadership");
    for (const page of allPages) {
      if (page === "/leadership") continue;
      expect(rolePageAccess.head_office).toContain(page);
    }
  });

  it("admin can access everything except /crm/templates", () => {
    expect(rolePageAccess.admin).not.toContain("/crm/templates");
    // But has all other pages
    for (const page of allPages) {
      if (page === "/crm/templates") continue;
      expect(rolePageAccess.admin).toContain(page);
    }
  });

  it("marketing can access marketing-relevant pages only", () => {
    const allowed = rolePageAccess.marketing;
    expect(allowed).toContain("/marketing");
    expect(allowed).toContain("/crm");
    expect(allowed).toContain("/communication");
    expect(allowed).toContain("/enquiries");
    // Sprint 1 cockpit grants — visible in Akram's sidebar.
    expect(allowed).toContain("/scorecard");
    expect(allowed).toContain("/holiday-quest");
    expect(allowed).toContain("/knowledge");
    expect(allowed).toContain("/leave");
    expect(allowed).toContain("/settings");
    expect(allowed).toContain("/assistant");
    // Still scoped out — marketing does NOT touch these.
    expect(allowed).not.toContain("/financials");
    expect(allowed).not.toContain("/team");
    expect(allowed).not.toContain("/rocks");
  });

  // 2026-04-30: `coordinator` enum value dropped — Service Coordinators
  // collapsed into Director of Service (`member`). The coordinator-specific
  // and "member ⊂ coordinator" tests below were removed; member's allowlist
  // is the canonical service-level scope going forward.
  it("member can access operational pages but not admin/financial", () => {
    const allowed = rolePageAccess.member;
    expect(allowed).toContain("/rocks");
    expect(allowed).toContain("/todos");
    expect(allowed).toContain("/compliance");
    expect(allowed).toContain("/leave");
    expect(allowed).not.toContain("/financials");
    expect(allowed).not.toContain("/settings");
    expect(allowed).not.toContain("/marketing");
    expect(allowed).not.toContain("/team");
  });

  it("staff has very limited access", () => {
    const allowed = rolePageAccess.staff;
    expect(allowed).toContain("/dashboard");
    expect(allowed).toContain("/my-portal");
    expect(allowed).toContain("/todos");
    expect(allowed).toContain("/compliance");
    expect(allowed).toContain("/leave");
    expect(allowed).not.toContain("/rocks");
    expect(allowed).not.toContain("/issues");
    expect(allowed).not.toContain("/financials");
    expect(allowed).not.toContain("/settings");
    expect(allowed).not.toContain("/marketing");
    expect(allowed).not.toContain("/meetings");
    expect(allowed).not.toContain("/scorecard");
  });

  it("every role has /dashboard and /profile access", () => {
    for (const role of ALL_ROLES) {
      expect(rolePageAccess[role]).toContain("/dashboard");
      expect(rolePageAccess[role]).toContain("/profile");
    }
  });
});

// ── 3. canAccessPage ──────────────────────────────────────

describe("canAccessPage", () => {
  it("returns true for undefined role (loading state)", () => {
    expect(canAccessPage(undefined, "/financials")).toBe(true);
  });

  it("allows owner to access any page", () => {
    for (const page of allPages) {
      expect(canAccessPage("owner", page)).toBe(true);
    }
  });

  it("allows sub-path matching", () => {
    expect(canAccessPage("member", "/compliance/templates")).toBe(true);
    expect(canAccessPage("staff", "/compliance/templates")).toBe(true);
  });

  it("blocks staff from /rocks", () => {
    expect(canAccessPage("staff", "/rocks")).toBe(false);
  });

  it("blocks marketing from /financials", () => {
    expect(canAccessPage("marketing", "/financials")).toBe(false);
  });
});

// ── 4. getAccessiblePages ─────────────────────────────────

describe("getAccessiblePages", () => {
  it("returns same pages as rolePageAccess", () => {
    for (const role of ALL_ROLES) {
      expect(getAccessiblePages(role)).toEqual(rolePageAccess[role]);
    }
  });

  it("owner page count matches total pages", () => {
    expect(getAccessiblePages("owner").length).toBe(allPages.length);
  });
});

// ── 5. hasFeature ─────────────────────────────────────────

describe("hasFeature", () => {
  it("returns false for undefined role", () => {
    expect(hasFeature(undefined, "org_settings.view")).toBe(false);
  });

  it("owner has all features", () => {
    expect(hasFeature("owner", "org_settings.view")).toBe(true);
    expect(hasFeature("owner", "org_settings.edit")).toBe(true);
    expect(hasFeature("owner", "api_keys.manage")).toBe(true);
    expect(hasFeature("owner", "users.import")).toBe(true);
  });

  it("head_office lacks owner-only features", () => {
    expect(hasFeature("head_office", "org_settings.edit")).toBe(false);
    expect(hasFeature("head_office", "api_keys.manage")).toBe(false);
    expect(hasFeature("head_office", "users.import")).toBe(false);
  });

  it("admin lacks settings and API key features", () => {
    expect(hasFeature("admin", "settings.view")).toBe(false);
    expect(hasFeature("admin", "api_keys.view")).toBe(false);
  });

  it("marketing has marketing features only", () => {
    expect(hasFeature("marketing", "marketing.view")).toBe(true);
    expect(hasFeature("marketing", "marketing.create")).toBe(true);
    expect(hasFeature("marketing", "crm.view")).toBe(true);
    expect(hasFeature("marketing", "financials.view")).toBe(false);
    expect(hasFeature("marketing", "rocks.view")).toBe(false);
  });

  it("staff can view and create todos", () => {
    expect(hasFeature("staff", "todos.view")).toBe(true);
    expect(hasFeature("staff", "todos.create")).toBe(true);
    expect(hasFeature("staff", "todos.edit")).toBe(true);
  });

  it("staff cannot create rocks or issues", () => {
    expect(hasFeature("staff", "rocks.create")).toBe(false);
    expect(hasFeature("staff", "issues.create")).toBe(false);
  });

  it("coordinator has member features plus compliance.create", () => {
    expect(hasFeature("member", "compliance.create")).toBe(true);
    expect(hasFeature("member", "onboarding.create")).toBe(true);
    // But not admin-level
    expect(hasFeature("member", "financials.view")).toBe(false);
  });

  it("all roles can request leave", () => {
    for (const role of ALL_ROLES) {
      // All except marketing (which doesn't have leave.request in our features)
      if (role === "marketing") continue;
      expect(hasFeature(role, "leave.request")).toBe(true);
    }
  });
});

// ── 6. hasMinRole (priority ordering) ─────────────────────

describe("hasMinRole (rolePriority)", () => {
  it("returns false for undefined role", () => {
    expect(hasMinRole(undefined, "staff")).toBe(false);
  });

  it("owner meets all minimum role requirements", () => {
    for (const role of ALL_ROLES) {
      expect(hasMinRole("owner", role)).toBe(true);
    }
  });

  it("head_office and admin have same priority (4)", () => {
    expect(hasMinRole("head_office", "admin")).toBe(true);
    expect(hasMinRole("admin", "head_office")).toBe(true);
  });

  it("marketing (3) is above coordinator (2)", () => {
    expect(hasMinRole("marketing", "member")).toBe(true);
    expect(hasMinRole("member", "marketing")).toBe(false);
  });

  it("member meets the member minimum (priority 2)", () => {
    expect(hasMinRole("member", "member")).toBe(true);
    expect(hasMinRole("member", "marketing")).toBe(false);
  });

  it("staff (1) cannot meet any higher role requirement", () => {
    expect(hasMinRole("staff", "staff")).toBe(true);
    expect(hasMinRole("staff", "member")).toBe(false);
    expect(hasMinRole("staff", "marketing")).toBe(false);
    expect(hasMinRole("staff", "admin")).toBe(false);
    expect(hasMinRole("staff", "owner")).toBe(false);
  });

  it("priority chain: owner(5) > head_office=admin(4) > marketing(3) > member(2) > staff(1)", () => {
    expect(hasMinRole("owner", "head_office")).toBe(true);
    expect(hasMinRole("head_office", "marketing")).toBe(true);
    expect(hasMinRole("marketing", "member")).toBe(true);
    expect(hasMinRole("member", "staff")).toBe(true);
    // Not vice versa
    expect(hasMinRole("staff", "member")).toBe(false);
    expect(hasMinRole("member", "marketing")).toBe(false);
    expect(hasMinRole("marketing", "admin")).toBe(false);
  });
});

// ── 7. permissionsTable ───────────────────────────────────

describe("permissionsTable", () => {
  it("has entries for all sections", () => {
    const sections = [...new Set(permissionsTable.map((r) => r.section))];
    expect(sections).toContain("Pages");
    expect(sections).toContain("Actions");
    expect(sections).toContain("Admin");
  });

  it("Dashboard row gives access to all roles", () => {
    const row = permissionsTable.find((r) => r.label === "Dashboard");
    expect(row).toBeDefined();
    for (const role of ALL_ROLES) {
      expect(row![role as keyof typeof row]).toBe(true);
    }
  });

  it("Financials row restricts to owner/head_office/admin only", () => {
    const row = permissionsTable.find((r) => r.label === "Financials");
    expect(row).toBeDefined();
    expect(row!.owner).toBe(true);
    expect(row!.head_office).toBe(true);
    expect(row!.admin).toBe(true);
    expect(row!.marketing).toBe(false);
    expect(row!.member).toBe(false);
    expect(row!.staff).toBe(false);
  });

  it("Manage API keys is owner-only", () => {
    const row = permissionsTable.find((r) => r.label === "Manage API keys");
    expect(row).toBeDefined();
    expect(row!.owner).toBe(true);
    expect(row!.head_office).toBe(false);
    expect(row!.admin).toBe(false);
    expect(row!.staff).toBe(false);
  });

  it("every row has boolean values for all roles", () => {
    for (const row of permissionsTable) {
      for (const role of ALL_ROLES) {
        expect(typeof row[role as keyof typeof row]).toBe("boolean");
      }
    }
  });
});

// ── 8. roleFeatures completeness ──────────────────────────

describe("roleFeatures", () => {
  it("every role has a features array", () => {
    for (const role of ALL_ROLES) {
      expect(Array.isArray(roleFeatures[role])).toBe(true);
      expect(roleFeatures[role].length).toBeGreaterThan(0);
    }
  });

  it("owner has the most features", () => {
    const ownerCount = roleFeatures.owner.length;
    for (const role of ALL_ROLES) {
      expect(roleFeatures[role].length).toBeLessThanOrEqual(ownerCount);
    }
  });

  it("marketing has the fewest features (specialized role)", () => {
    const marketingCount = roleFeatures.marketing.length;
    for (const role of ALL_ROLES) {
      expect(roleFeatures[role].length).toBeGreaterThanOrEqual(marketingCount);
    }
  });
});

// ── 9. parseRole (safe session.user.role narrowing) ───────

describe("parseRole", () => {
  it("returns the Role enum value for a valid role string", () => {
    expect(parseRole("admin")).toBe(Role.admin);
    expect(parseRole("owner")).toBe(Role.owner);
    expect(parseRole("member")).toBe(Role.member);
  });

  it("returns null for undefined", () => {
    expect(parseRole(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseRole(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRole("")).toBeNull();
  });

  it("returns null for nonsense strings", () => {
    expect(parseRole("nonsense")).toBeNull();
    expect(parseRole("administrator")).toBeNull();
  });

  it("is case-sensitive — returns null for wrong case", () => {
    expect(parseRole("ADMIN")).toBeNull();
    expect(parseRole("Admin")).toBeNull();
  });

  it("returns null for non-string types", () => {
    expect(parseRole(123 as unknown)).toBeNull();
    expect(parseRole({} as unknown)).toBeNull();
  });
});
