/**
 * E2E: Admin can View qualifications + compliance certificates.
 *
 * Regression coverage for v1: the Certifications sub-tab was never updated
 * in v1. Qualifications still linked at raw blob URLs (no auth check) and
 * compliance certs only had a Download action — no View affordance.
 *
 * v2 adds:
 *   - GET /api/qualifications/[id]/download (new auth-checked proxy)
 *   - View + Download action pair on both qualification rows and compliance
 *     certificate rows.
 *
 * This spec verifies the proxy redirects + the UI exposes View links to
 * the correct endpoints.
 */
import { test, expect } from "@playwright/test";

test.describe("Admin staff profile — certifications view", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("qualification rows have a View action via the qualifications proxy", async ({ page, request }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });

    // Certifications is the default sub-tab of the Documents (yellow) section,
    // but explicit click guards against future default changes.
    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    const qualView = page
      .getByRole("link", { name: /^View$/ })
      .filter({ has: page.locator(`[href^="/api/qualifications/"]`) })
      .first();

    if (!(await qualView.count())) {
      test.skip(true, "No qualifications with files seeded — nothing to test");
    }

    const href = await qualView.getAttribute("href");
    expect(href).toMatch(/^\/api\/qualifications\/[^/?]+\/download$/);

    const res = await request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/^https?:\/\//);
  });

  test("compliance certificate rows have a View action via the compliance proxy", async ({ page, request }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });
    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    const certView = page
      .getByRole("link", { name: /^View$/ })
      .filter({ has: page.locator(`[href^="/api/compliance/"]`) })
      .first();

    if (!(await certView.count())) {
      test.skip(true, "No compliance certificates with files seeded");
    }

    const href = await certView.getAttribute("href");
    expect(href).toMatch(/^\/api\/compliance\/[^/?]+\/download$/);

    const res = await request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/^https?:\/\//);
  });

  test("compliance Download (?download=1) is a distinct action from View", async ({ page }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });
    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    const certView = page
      .getByRole("link", { name: /^View$/ })
      .filter({ has: page.locator(`[href^="/api/compliance/"]`) })
      .first();
    const certDownload = page
      .getByRole("link", { name: /^Download$/ })
      .filter({ has: page.locator(`[href*="?download=1"]`) })
      .first();

    if (!(await certView.count())) {
      test.skip(true, "No compliance certificates with files seeded");
    }

    // Both affordances exist on the same row.
    await expect(certView).toBeVisible();
    await expect(certDownload).toBeVisible();
    const downloadHref = await certDownload.getAttribute("href");
    expect(downloadHref).toMatch(/^\/api\/compliance\/[^/?]+\/download\?download=1$/);
  });
});
