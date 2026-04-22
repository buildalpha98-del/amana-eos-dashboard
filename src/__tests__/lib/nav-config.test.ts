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

  it("includes /contracts for member (has contracts.view + rolePageAccess)", () => {
    const filtered = filterNavItems(navItems, "member" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
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
