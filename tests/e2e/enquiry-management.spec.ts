/**
 * E2E: Enquiry management flow
 *
 * Login → navigate to enquiries → view enquiry list → check details
 */

import { test, expect } from "@playwright/test";

test.describe("Enquiry management flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("navigates to enquiries page", async ({ page }) => {
    await page.goto("/enquiries");
    await expect(page).toHaveURL(/enquiries/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("navigates to conversions page", async ({ page }) => {
    await page.goto("/conversions");
    await expect(page).toHaveURL(/conversions/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("navigates to CRM pipeline", async ({ page }) => {
    await page.goto("/crm");
    await expect(page).toHaveURL(/crm/);
    await expect(page.locator("main")).toBeVisible();
  });
});
