/**
 * E2E: Compliance audit flow
 *
 * Login → navigate to compliance → view templates → verify page loads
 */

import { test, expect } from "@playwright/test";

test.describe("Compliance audit flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("navigates to compliance page", async ({ page }) => {
    await page.goto("/compliance");
    await expect(page).toHaveURL(/compliance/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("navigates to compliance templates", async ({ page }) => {
    await page.goto("/compliance/templates");
    await expect(page).toHaveURL(/compliance\/templates/);
    await expect(page.locator("main")).toBeVisible();
  });
});
