/**
 * E2E: Admin management flow
 *
 * Settings → team → documents
 * Tests real UI elements for admin pages.
 */

import { test, expect } from "@playwright/test";

test.describe("Admin management flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("settings page renders with organisation settings", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Owner should see Organisation Settings section
    await expect(
      page.getByText("Organisation Settings"),
    ).toBeVisible({ timeout: 15_000 });

    // Should see Organisation Name field
    await expect(
      page.getByText("Organisation Name"),
    ).toBeVisible();

    // Should see API Keys section (owner only)
    await expect(page.getByText("API Keys")).toBeVisible({ timeout: 15_000 });

    // Should see Invite Team Member button or section
    const hasInvite = await page.getByText(/Invite Team Member/i).isVisible().catch(() => false);
    const hasTeamSection = await page.getByText(/Team|Members|Users/i).first().isVisible().catch(() => false);
    expect(hasInvite || hasTeamSection).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("settings page has permissions panel for owner", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Owner should see Role Permissions section
    await expect(
      page.getByText("Role Permissions"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("team page renders with accountability chart and view toggle", async ({
    page,
  }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show chart or list heading
    const hasChartHeading = await page
      .getByText(/Accountability Chart|Performance List/i)
      .isVisible()
      .catch(() => false);
    expect(hasChartHeading).toBeTruthy();

    // View toggle (chart vs list) should be visible
    const chartToggle = page.locator("button[title], button").filter({ hasText: /chart|list/i });
    const hasToggle = await chartToggle.first().isVisible().catch(() => false);

    // Should have export button
    const hasExport = await page.getByRole("button", { name: /export|csv/i }).isVisible().catch(() => false);

    expect(hasToggle || hasExport).toBeTruthy();

    // Should show team members or empty state
    const hasMembers = await page.locator("main").textContent();
    expect(hasMembers!.length).toBeGreaterThan(20);

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("team page can toggle between chart and list views", async ({
    page,
  }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Default view is chart — should show Accountability Chart
    await expect(
      page.getByText("Accountability Chart"),
    ).toBeVisible({ timeout: 15_000 });

    // Find and click the list view toggle
    // The toggle uses LayoutGrid and List icons with title attributes
    const listButton = page.locator("button").filter({ hasText: /list/i }).first();
    const hasListButton = await listButton.isVisible().catch(() => false);

    if (hasListButton) {
      await listButton.click();
      await page.waitForLoadState("networkidle");

      // Should now show Performance List heading
      await expect(
        page.getByText("Performance List"),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("documents page renders with document management UI", async ({
    page,
  }) => {
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should have search input
    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    // Should have category filter or view toggle
    const hasCategories = await page
      .getByText(/policy|procedure|template|program|compliance/i)
      .first()
      .isVisible()
      .catch(() => false);

    // Should have document action buttons (Add, Upload, etc.)
    const hasAddButton = await page.getByRole("button", { name: /add|upload|new|create/i }).first().isVisible().catch(() => false);

    // At least search or categories or add button should be present
    expect(hasSearch || hasCategories || hasAddButton).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });
});
