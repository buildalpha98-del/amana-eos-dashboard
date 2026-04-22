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
});
