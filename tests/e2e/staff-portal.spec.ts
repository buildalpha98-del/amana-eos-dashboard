/**
 * E2E: Staff portal flow
 *
 * Login → view My Portal → check onboarding → view documents →
 * view compliance → access leave
 */

import { test, expect } from "@playwright/test";

test.describe("Staff portal flow", () => {
  test.use({
    storageState: ".playwright/auth/staff.json",
  });

  test("views My Portal", async ({ page }) => {
    await page.goto("/my-portal");
    await expect(page).toHaveURL(/my-portal/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("accesses onboarding page", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/onboarding/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("views documents", async ({ page }) => {
    await page.goto("/documents");
    await expect(page).toHaveURL(/documents/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("views compliance page", async ({ page }) => {
    await page.goto("/compliance");
    await expect(page).toHaveURL(/compliance/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("can access leave page", async ({ page }) => {
    await page.goto("/leave");
    await expect(page).toHaveURL(/leave/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("cannot access admin pages", async ({ page }) => {
    // Staff should be redirected or shown unauthorized for admin routes
    await page.goto("/settings");
    // Either redirected away or shown an error
    const url = page.url();
    expect(url).not.toContain("/settings");
  });

  test("cannot access financial pages", async ({ page }) => {
    await page.goto("/financials");
    const url = page.url();
    expect(url).not.toContain("/financials");
  });
});
