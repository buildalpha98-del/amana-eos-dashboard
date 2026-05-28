/**
 * E2E: Admin can View a staff-uploaded document inline.
 *
 * Regression coverage for v1: the Documents sub-tab linked directly at the
 * raw blob URL with label "Download". After v1 the link goes through
 * /api/staff-documents/[id] (auth-checked redirect) with two affordances:
 * View (inline) and Download (forced attachment).
 *
 * This spec verifies:
 *   1. The Documents sub-tab is reachable.
 *   2. If there's at least one document, it has a View action whose href
 *      points at the proxy (not the raw blob URL).
 *   3. The View action returns a 307 from the proxy when followed (not a
 *      403 or 500), meaning the auth check passes for an owner.
 */
import { test, expect } from "@playwright/test";

test.describe("Admin staff profile — document view", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("Documents tab exposes a View action via the proxy endpoint", async ({ page, request }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });

    // Switch to the Documents sub-tab of the yellow Documents section.
    await page.getByRole("tab", { name: /^Documents$/ }).click();

    const viewLink = page
      .getByRole("link", { name: /^View$/ })
      .filter({ has: page.locator(`[href^="/api/staff-documents/"]`) })
      .first();

    if (!(await viewLink.count())) {
      test.skip(true, "No staff documents seeded — nothing to test");
    }

    // Verify the link points at the proxy, not at a raw blob URL.
    const href = await viewLink.getAttribute("href");
    expect(href).toMatch(/^\/api\/staff-documents\/[^/?]+$/);

    // Follow it: the proxy must return a redirect (307) when called with the
    // owner's session cookie — not 403 / 500.
    const proxyResponse = await request.get(href!, { maxRedirects: 0 });
    expect(proxyResponse.status()).toBe(307);
    const target = proxyResponse.headers()["location"] ?? "";
    expect(target).toMatch(/^https?:\/\//);
  });
});
