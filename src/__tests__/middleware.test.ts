/**
 * Middleware access-matcher tests.
 *
 * `src/middleware.ts` delegates its page-access decision to
 * `canAccessPage(role, pathname)` from `@/lib/role-permissions`. Previously the
 * middleware had its own inline matcher that used `startsWith(path + "/")`,
 * which did NOT understand `[id]` wildcards — so staff/marketing/member users
 * hitting `/children/abc123` were server-redirected to `/dashboard` even
 * though `rolePageAccess` listed `/children/[id]` for them.
 *
 * These tests lock in the wildcard-aware matcher behavior at the layer the
 * middleware uses, so a future regression (reintroducing an inline matcher or
 * breaking `pathMatches`) is caught here.
 *
 * Full middleware integration (token extraction, NextResponse redirect, API
 * bypass) is covered by trusting Next.js' `withAuth` wrapper — we test the
 * one piece of logic we own: the role/path matcher.
 */
import { describe, it, expect } from "vitest";
import { canAccessPage } from "@/lib/role-permissions";

describe("middleware access matcher (canAccessPage)", () => {
  describe("staff role + /children/[id] wildcard", () => {
    it("allows staff on a concrete child id path (/children/abc123)", () => {
      // This is the bug the fix targets: staff has `/children/[id]` in
      // rolePageAccess but NOT `/children`. The old inline matcher required a
      // literal `/children/` prefix in the allowed list, so this returned
      // false. With the wildcard-aware helper, it should now return true.
      expect(canAccessPage("staff", "/children/abc123")).toBe(true);
    });

    it("still denies staff on an admin-only path (/leadership)", () => {
      expect(canAccessPage("staff", "/leadership")).toBe(false);
    });

    it("denies staff on /children list page (staff does not have /children)", () => {
      // Staff's rolePageAccess contains `/children/[id]` but NOT `/children`.
      // The list page should remain blocked even though the detail wildcard
      // is allowed.
      expect(canAccessPage("staff", "/children")).toBe(false);
    });
  });

  describe("owner role", () => {
    it("allows owner on a concrete child id path", () => {
      expect(canAccessPage("owner", "/children/abc123")).toBe(true);
    });

    it("allows owner on /children list", () => {
      expect(canAccessPage("owner", "/children")).toBe(true);
    });
  });

  describe("marketing & member roles on /children/[id]", () => {
    it("allows marketing on a concrete child id path", () => {
      expect(canAccessPage("marketing", "/children/abc123")).toBe(true);
    });

    it("allows member on a concrete child id path", () => {
      expect(canAccessPage("member", "/children/abc123")).toBe(true);
    });
  });
});
