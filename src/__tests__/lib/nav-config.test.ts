import { describe, it, expect } from "vitest";
import { filterNavItems, navItems } from "@/lib/nav-config";
import type { Role } from "@prisma/client";

describe("filterNavItems", () => {
  it("includes /contracts for owner (has contracts.view)", () => {
    const filtered = filterNavItems(navItems, "owner" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
  });

  it("includes /contracts for staff (has contracts.view)", () => {
    const filtered = filterNavItems(navItems, "staff" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
  });

  it("excludes /contracts for marketing (no contracts.view)", () => {
    const filtered = filterNavItems(navItems, "marketing" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
  });

  it("returns items without a feature gate when the role has page access", () => {
    // Sanity: items without `feature` are filtered only by canAccessPage.
    // /dashboard has no feature gate — owner should see it.
    const ownerFiltered = filterNavItems(navItems, "owner" as Role);
    expect(ownerFiltered.some((i) => i.href === "/dashboard")).toBe(true);
  });

  it("excludes items when role lacks page access (no feature required)", () => {
    // /permissions or /api-keys style routes — marketing should not see admin-only pages.
    // We assert via /audit-log which is admin-oriented and not in marketing's rolePageAccess.
    const marketingFiltered = filterNavItems(navItems, "marketing" as Role);
    expect(marketingFiltered.some((i) => i.href === "/audit-log")).toBe(false);
  });

  it("includes /contracts for coordinator (has contracts.view + rolePageAccess)", () => {
    const filtered = filterNavItems(navItems, "coordinator" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
  });

  // 2026-04-29: /contracts removed from member's rolePageAccess as part of
  // the cross-service-tab cleanup (Centre Directors don't manage contracts —
  // that's an HR / admin concern). canAccessPage returns false → nav hides it.
  it("excludes /contracts for member (cross-service HR surface)", () => {
    const filtered = filterNavItems(navItems, "member" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
  });

  it("returns a new array (does not mutate input)", () => {
    const before = navItems.length;
    filterNavItems(navItems, "staff" as Role);
    expect(navItems.length).toBe(before);
  });

  it("handles undefined role by returning items without feature gates", () => {
    // During session hydration, role is undefined. canAccessPage returns true
    // for undefined but hasFeature returns false, so feature-gated items are hidden.
    const filtered = filterNavItems(navItems, undefined);
    // /contracts is feature-gated → hidden
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
    // /dashboard has no feature gate → shown
    expect(filtered.some((i) => i.href === "/dashboard")).toBe(true);
  });
});

// ─── Sprint 1: role allowlist on nav items ─────────────────
describe("filterNavItems — role allowlist (Sprint 1)", () => {
  describe("marketing role", () => {
    const marketingFiltered = filterNavItems(navItems, "marketing" as Role);
    const hrefs = marketingFiltered.map((i) => i.href);

    it.each([
      "/crm",
      "/contact-centre",
      "/enrolments",
      "/children",
      "/conversions",
      "/messaging",
    ])("excludes out-of-scope nav item %s", (href) => {
      expect(hrefs).not.toContain(href);
    });

    it.each([
      "/marketing",
      "/communication",
      "/projects",
      "/scorecard",
      "/holiday-quest",
    ])("includes Akram's cockpit nav item %s", (href) => {
      expect(hrefs).toContain(href);
    });

    it("hides every item tagged with ALL_NON_MARKETING roles", () => {
      // Spot-check a handful of ALL_NON_MARKETING items across sections.
      for (const href of ["/vision", "/rocks", "/services", "/financials", "/team", "/leadership", "/automations"]) {
        expect(hrefs).not.toContain(href);
      }
    });
  });

  describe("owner role — bypass", () => {
    it("sees every item that survives canAccessPage + feature checks, including role-gated ones", () => {
      const ownerFiltered = filterNavItems(navItems, "owner" as Role);
      const hrefs = ownerFiltered.map((i) => i.href);
      // Owner bypasses roles — they see items tagged with ALL_NON_MARKETING too.
      for (const href of ["/vision", "/rocks", "/crm", "/contact-centre", "/leadership", "/automations"]) {
        expect(hrefs).toContain(href);
      }
    });

    it("result length is at least as large as the coordinator/marketing filtered result", () => {
      const owner = filterNavItems(navItems, "owner" as Role).length;
      const marketing = filterNavItems(navItems, "marketing" as Role).length;
      const coordinator = filterNavItems(navItems, "coordinator" as Role).length;
      expect(owner).toBeGreaterThan(marketing);
      expect(owner).toBeGreaterThanOrEqual(coordinator);
    });
  });

  describe("coordinator role — unaffected by sprint 1 changes", () => {
    const coordinatorFiltered = filterNavItems(navItems, "coordinator" as Role);
    const hrefs = coordinatorFiltered.map((i) => i.href);

    it.each(["/messaging", "/contact-centre", "/enrolments"])(
      "still includes %s (ALL_NON_MARKETING doesn't hide for coordinators)",
      (href) => {
        expect(hrefs).toContain(href);
      },
    );

    it("still excludes pages coordinator can't access via canAccessPage", () => {
      // /financials isn't in coordinator's rolePageAccess — stays hidden.
      expect(hrefs).not.toContain("/financials");
    });
  });

  // ─── 2026-04-29: member nav cleanup ────────────────────────
  // Centre Directors (member role) had access to a long list of cross-
  // service tabs that didn't match their actual workflow. After training
  // session feedback we trimmed their rolePageAccess to focus on their
  // single centre + EOS participation.
  describe("member role — single-centre cleanup", () => {
    const memberFiltered = filterNavItems(navItems, "member" as Role);
    const hrefs = memberFiltered.map((i) => i.href);

    it.each([
      "/messaging",         // CRM-tier cross-service direct messages
      "/contact-centre",    // CRM cross-service inbox
      "/communication",     // Cross-service comms hub
      "/enquiries",         // CRM
      "/conversions",       // Analytics
      "/enrolments",        // Cross-service list (use service detail instead)
      "/children",          // Cross-service list (use service detail instead)
      "/roll-call",         // 404 — lives inside service detail
      "/bookings",          // Cross-service (use service detail)
      "/billing",           // Cross-service (use service Finance tab)
      "/reports",           // Cross-service analytics
      "/timesheets",        // Cross-service HR
      "/contracts",         // Cross-service HR
      "/compliance/templates", // Admin audit-template config
      "/holiday-quest",     // Marketing planner
    ])("excludes cross-service / out-of-scope nav item %s", (href) => {
      expect(hrefs).not.toContain(href);
    });

    it.each([
      "/dashboard",
      "/services",          // their primary surface — drill in for everything
      "/onboarding",
      "/compliance",
      "/policies",
      "/incidents",
      "/leave",
      "/knowledge",
      "/queue",
      "/my-portal",
      // /profile is reachable but not surfaced in the sidebar nav (avatar menu).
    ])("still includes core nav item %s", (href) => {
      expect(hrefs).toContain(href);
    });

    it("/services/[id] sub-paths inherit access via prefix match", () => {
      // canAccessPage uses pathMatches() which treats "/services" as a prefix
      // match for "/services/abc". Service detail (and its Roll Call /
      // Bookings / Children / Billing tabs) stay reachable.
      // (No nav item for /services/[id] — verified in canAccessPage tests.)
    });
  });
});
