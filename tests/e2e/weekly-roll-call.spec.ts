/**
 * E2E: Weekly roll-call grid
 *
 * Navigates to /services → first service → Daily Ops → Roll Call → Weekly view.
 * Verifies the grid renders without errors and exercises the sign-in flow when
 * a booked shift is available.
 *
 * Note: This spec intentionally uses whatever data exists in the test database.
 * Full seed helpers (seedTestService + seedTestChildBooking with deterministic
 * bookings for a known child) are deferred — this spec asserts graceful
 * behaviour whether or not bookings exist, and runs a click-through where
 * possible.
 */

import { test, expect } from "@playwright/test";

test.describe("Weekly roll-call grid", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("weekly grid renders without errors", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    const serviceLink = page.locator("a[href*='/services/']").first();
    const hasLink = await serviceLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, "No services exist in test DB");
      return;
    }

    const href = await serviceLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Navigate directly to the weekly roll-call view — avoids flaky tab clicks.
    await page.goto(`${href}?tab=daily-ops&sub=roll-call&rollCallView=weekly`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // The week-of label is always rendered regardless of data; it's the canonical
    // signal that the grid mounted successfully.
    const weekLabel = page.getByTestId("weekly-range-label");
    await expect(weekLabel).toBeVisible({ timeout: 10_000 });
    await expect(weekLabel).toContainText(/week of/i);

    // No crash UI.
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("weekly grid — owner sees 'Add child to week' button", async ({
    page,
  }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    const serviceLink = page.locator("a[href*='/services/']").first();
    const hasLink = await serviceLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, "No services exist in test DB");
      return;
    }
    const href = await serviceLink.getAttribute("href");

    await page.goto(`${href}?tab=daily-ops&sub=roll-call&rollCallView=weekly`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("button", { name: /add child to week/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("weekly grid — sign-in persists across reload when bookings exist", async ({
    page,
  }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    const serviceLink = page.locator("a[href*='/services/']").first();
    const hasLink = await serviceLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, "No services exist in test DB");
      return;
    }
    const href = await serviceLink.getAttribute("href");
    await page.goto(`${href}?tab=daily-ops&sub=roll-call&rollCallView=weekly`);
    await page.waitForLoadState("networkidle");

    // Find the first booked cell (teal background is matched by data-testid prefix).
    const bookedCell = page
      .locator('[data-testid^="weekly-cell-shift-"]')
      .first();
    const hasBooked = await bookedCell.isVisible().catch(() => false);
    if (!hasBooked) {
      test.skip(true, "No booked shifts in test DB — can't exercise sign-in");
      return;
    }

    await bookedCell.click();
    const signInBtn = page.getByRole("button", { name: /^sign in$/i });
    const hasSignIn = await signInBtn.isVisible().catch(() => false);

    if (!hasSignIn) {
      // The cell may already be signed in/out — nothing to assert.
      return;
    }

    await signInBtn.click();
    // Wait for the mutation's invalidate → refetch.
    await page.waitForLoadState("networkidle");

    // Find the first signed-in cell text ("In: HH:MM") after the mutation.
    const signedInIndicator = page.getByText(/^in: \d{1,2}:\d{2}/i).first();
    await expect(signedInIndicator).toBeVisible({ timeout: 10_000 });

    // Reload — the signed-in indicator must persist.
    await page.reload();
    await page.waitForLoadState("networkidle");
    const reloadedIndicator = page.getByText(/^in: \d{1,2}:\d{2}/i).first();
    await expect(reloadedIndicator).toBeVisible({ timeout: 10_000 });
  });
});
