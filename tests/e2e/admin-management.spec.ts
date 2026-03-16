/**
 * E2E: Admin management flow
 *
 * Login → navigate to settings → verify team page → navigate services
 */

import { test, expect } from "@playwright/test";

test.describe("Admin management flow", () => {
  test.use({
    storageState: ".playwright/auth/admin.json",
  });

  test("navigates to team page", async ({ page }) => {
    await page.goto("/team");
    await expect(page).toHaveURL(/team/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("navigates to services page", async ({ page }) => {
    await page.goto("/services");
    await expect(page).toHaveURL(/services/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("accesses compliance management", async ({ page }) => {
    await page.goto("/compliance");
    await expect(page).toHaveURL(/compliance/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("accesses leave management", async ({ page }) => {
    await page.goto("/leave");
    await expect(page).toHaveURL(/leave/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("accesses timesheets", async ({ page }) => {
    await page.goto("/timesheets");
    await expect(page).toHaveURL(/timesheets/);
    await expect(page.locator("main")).toBeVisible();
  });
});
