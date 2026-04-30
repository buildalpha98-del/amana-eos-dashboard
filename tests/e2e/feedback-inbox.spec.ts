/**
 * E2E: Report Issue feedback flow
 *
 * Submit via FeedbackWidget → admin visits /admin/feedback →
 * sees new row → opens detail → transitions status to resolved →
 * audit log entry recorded.
 */

import { test, expect } from "@playwright/test";

test.describe("Feedback inbox flow", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("submit via widget → appears in admin inbox → resolve", async ({ page }) => {
    // 1. Visit dashboard and submit via floating widget
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const widgetTrigger = page.getByRole("button", { name: /send feedback/i });
    await expect(widgetTrigger).toBeVisible({ timeout: 10_000 });
    await widgetTrigger.click();

    await page.locator("#fb-category").selectOption("bug");
    const uniqueMessage = `E2E test bug ${Date.now()}`;
    await page.locator("#fb-message").fill(uniqueMessage);
    await page.getByRole("button", { name: /submit feedback/i }).click();

    // Confirm toast
    await expect(page.getByText(/feedback submitted/i)).toBeVisible({ timeout: 10_000 });

    // 2. Navigate to inbox
    await page.goto("/admin/feedback");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /report issue inbox/i })).toBeVisible();

    // 3. Find the newly-created row
    const row = page.locator("tr", { hasText: uniqueMessage }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 4. Open detail + transition to resolved
    await row.click();
    const detail = page.getByLabel("Feedback detail");
    await expect(detail).toBeVisible({ timeout: 10_000 });

    await detail.locator("#fb-status").selectOption("resolved");

    // 5. Close + reopen — confirm status persisted
    await detail.getByLabel("Close").click();
    await page.reload();
    await page.waitForLoadState("networkidle");

    const resolvedRow = page.locator("tr", { hasText: uniqueMessage }).first();
    await expect(resolvedRow.getByText(/resolved/i)).toBeVisible();
  });

  test.describe("non-admin access", () => {
    test.use({ storageState: ".playwright/auth/staff.json" });

    test("staff role: sidebar has no Feedback Inbox + page guarded", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Sidebar should not surface the nav item for staff
      await expect(page.getByRole("link", { name: /feedback inbox/i })).toHaveCount(0);

      // Even direct navigation should not load the inbox content
      await page.goto("/admin/feedback");
      await page.waitForLoadState("networkidle");

      // Report Issue Inbox heading must not render
      await expect(page.getByRole("heading", { name: /report issue inbox/i })).toHaveCount(0);
    });
  });
});
