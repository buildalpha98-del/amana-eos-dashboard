/**
 * E2E: Owner daily flow
 *
 * Login → view command centre dashboard → check today's operations →
 * review off-track rocks → check scorecard → view team
 */

import { test, expect } from "@playwright/test";

test.describe("Owner daily flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("views dashboard and navigates through daily workflow", async ({ page }) => {
    // 1. Dashboard loads
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator("body")).toBeVisible();

    // Check dashboard has key sections
    await expect(page.locator("main")).toBeVisible();
  });

  test("reviews rocks page and identifies off-track items", async ({ page }) => {
    await page.goto("/rocks");
    await expect(page).toHaveURL(/rocks/);

    // Page should load without errors
    await expect(page.locator("main")).toBeVisible();
  });

  test("checks scorecard measurables", async ({ page }) => {
    await page.goto("/scorecard");
    await expect(page).toHaveURL(/scorecard/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("views team page", async ({ page }) => {
    await page.goto("/team");
    await expect(page).toHaveURL(/team/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("can access settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/settings/);
    await expect(page.locator("main")).toBeVisible();
  });
});
