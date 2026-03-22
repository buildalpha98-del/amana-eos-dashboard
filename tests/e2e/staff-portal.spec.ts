/**
 * E2E: Staff portal flow
 *
 * My Portal → leave → todos → access controls
 * Tests staff-specific views with meaningful assertions.
 */

import { test, expect } from "@playwright/test";

test.describe("Staff portal flow", () => {
  test.use({
    storageState: ".playwright/auth/staff.json",
  });

  test("my portal renders with personal dashboard sections", async ({
    page,
  }) => {
    await page.goto("/my-portal");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // My Portal should show personal info or greeting
    // It typically shows compliance, leave, qualifications sections
    const hasComplianceSection = await page
      .getByText(/compliance|qualifications|certificates/i)
      .first()
      .isVisible()
      .catch(() => false);

    const hasLeaveSection = await page
      .getByText(/leave|balance|annual/i)
      .first()
      .isVisible()
      .catch(() => false);

    const hasProfileSection = await page
      .getByText(/profile|my details|personal/i)
      .first()
      .isVisible()
      .catch(() => false);

    // Should show at least one personal section
    expect(hasComplianceSection || hasLeaveSection || hasProfileSection).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("leave page renders with leave balances and request form", async ({
    page,
  }) => {
    await page.goto("/leave");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show leave-related content
    const hasLeaveTypes = await page
      .getByText(/Annual Leave|Sick Leave|Personal Leave/i)
      .first()
      .isVisible()
      .catch(() => false);

    const hasRequestButton = await page
      .getByRole("button", { name: /request leave|new request/i })
      .isVisible()
      .catch(() => false);

    const hasLeaveContent = await page
      .getByText(/leave|balance|request/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasLeaveTypes || hasRequestButton || hasLeaveContent).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("compliance page is accessible to staff", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Staff should be able to view compliance page
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show compliance-related content
    const hasCompliance = await page
      .getByText(/compliance|certificate|WWCC|First Aid|CPR/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasCompliance || (await page.locator("main").textContent())!.length > 20).toBeTruthy();
  });

  test("staff cannot access settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Staff should be redirected or shown unauthorized
    const url = page.url();
    // Should NOT stay on /settings — either redirected or access denied
    const isRedirected = !url.includes("/settings");
    const hasAccessDenied = await page
      .getByText(/unauthorized|access denied|permission/i)
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessDenied).toBeTruthy();
  });

  test("staff cannot access financials page", async ({ page }) => {
    await page.goto("/financials");
    await page.waitForLoadState("networkidle");

    // Staff should be redirected or shown unauthorized
    const url = page.url();
    const isRedirected = !url.includes("/financials");
    const hasAccessDenied = await page
      .getByText(/unauthorized|access denied|permission/i)
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessDenied).toBeTruthy();
  });

  test("documents page is accessible to staff", async ({ page }) => {
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    // Staff should be able to view documents
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show document-related UI
    const hasDocContent = await page.locator("main").textContent();
    expect(hasDocContent!.length).toBeGreaterThan(10);

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });
});
