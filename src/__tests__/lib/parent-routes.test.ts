/**
 * Guards the public-route list AND the thing that actually broke: the check
 * being duplicated across two components, so fixing one gate left the other
 * still redirecting parents away from signup/confirm.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isPublicParentRoute, PUBLIC_PARENT_ROUTES } from "@/lib/parent-routes";

describe("isPublicParentRoute", () => {
  it("allows the routes a signed-out parent must reach", () => {
    expect(isPublicParentRoute("/parent/login")).toBe(true);
    expect(isPublicParentRoute("/parent/signup")).toBe(true);
    expect(isPublicParentRoute("/parent/confirm")).toBe(true);
  });

  it("still gates the authenticated portal", () => {
    for (const p of ["/parent", "/parent/children", "/parent/billing", "/parent/bookings"]) {
      expect(isPublicParentRoute(p), p).toBe(false);
    }
  });

  it("handles null/undefined without throwing", () => {
    expect(isPublicParentRoute(null)).toBe(false);
    expect(isPublicParentRoute(undefined)).toBe(false);
  });

  it("signup and confirm are public — the pages that were unreachable", () => {
    expect(PUBLIC_PARENT_ROUTES).toContain("/parent/signup");
    expect(PUBLIC_PARENT_ROUTES).toContain("/parent/confirm");
  });
});

describe("no duplicated auth gates", () => {
  // The original bug: both files hardcoded `pathname !== "/parent/login"`,
  // so the list had to be changed in two places and one was missed.
  const files = [
    "src/app/parent/ParentShell.tsx",
    "src/components/parent/ParentAuthProvider.tsx",
  ];

  it.each(files)("%s uses the shared helper, not a hardcoded path", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("isPublicParentRoute");
    // No bare equality check against the login path.
    expect(src).not.toMatch(/pathname\s*[!=]==\s*["']\/parent\/login["']/);
  });
});
