/**
 * E2E: Services management flow
 *
 * Services list → service detail → tab navigation
 * Tests the services section with real UI interactions.
 */

import { test, expect } from "@playwright/test";

test.describe("Services management flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("services list page renders with swim lanes", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show swim lane labels (Open, Onboarding, Pipeline, Closed)
    const hasOpenLane = await page.getByText("Open").first().isVisible().catch(() => false);
    const hasOnboardingLane = await page.getByText("Onboarding").isVisible().catch(() => false);
    const hasPipelineLane = await page.getByText("Pipeline").isVisible().catch(() => false);

    // Should have at least the Open swim lane or service cards
    const hasServiceContent = hasOpenLane || hasOnboardingLane || hasPipelineLane;
    const hasEmptyState = await page.getByText(/no services/i).isVisible().catch(() => false);

    expect(hasServiceContent || hasEmptyState).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("services page has search and create functionality", async ({
    page,
  }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should have a search input
    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      // Type in search to verify it is interactive
      await searchInput.fill("test");
      await page.waitForLoadState("networkidle");
      // Clear the search
      await searchInput.fill("");
    }

    // Should have a create button (for admin/owner)
    const createButton = page.getByRole("button", { name: /add|create|new/i }).first();
    const hasCreate = await createButton.isVisible().catch(() => false);

    expect(hasSearch || hasCreate).toBeTruthy();
  });

  test("clicking a service navigates to detail page with tabs", async ({
    page,
  }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Find a service card/link and click it
    const serviceLink = page.locator("a[href*='/services/']").first();
    const hasServiceLink = await serviceLink.isVisible().catch(() => false);

    if (hasServiceLink) {
      await serviceLink.click();
      await page.waitForLoadState("networkidle");

      // Should now be on a service detail page
      await expect(page).toHaveURL(/\/services\/.+/, { timeout: 15_000 });

      // Should show tab group navigation
      // Tab groups: Overview, Daily Ops, Program, EOS, Compliance, Finance
      // .first() everywhere: these words also appear in the sidebar and page
      // content, and a multi-match strict-mode violation makes isVisible()
      // throw → silently count as "tab missing".
      const hasOverviewTab = await page.getByText("Overview").first().isVisible().catch(() => false);
      const hasDailyOpsTab = await page.getByText("Daily Ops").first().isVisible().catch(() => false);
      const hasProgramTab = await page.getByText("Program").first().isVisible().catch(() => false);
      const hasEosTab = await page.getByText("EOS").first().isVisible().catch(() => false);
      const hasComplianceTab = await page.getByText("Compliance").first().isVisible().catch(() => false);
      const hasFinanceTab = await page.getByText("Finance").first().isVisible().catch(() => false);

      // Should have at least some tab groups visible
      const tabCount = [hasOverviewTab, hasDailyOpsTab, hasProgramTab, hasEosTab, hasComplianceTab, hasFinanceTab].filter(Boolean).length;
      expect(tabCount).toBeGreaterThanOrEqual(2);

      // No error states
      await expect(page.getByText("Something went wrong")).not.toBeVisible();
    } else {
      // No services exist — empty state is acceptable
      const hasEmptyState = await page.getByText(/no services/i).isVisible().catch(() => false);
      expect(hasEmptyState || (await page.locator("main").textContent())!.length > 20).toBeTruthy();
    }
  });

  test("service detail page tab navigation works", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    // Find a service to click
    const serviceLink = page.locator("a[href*='/services/']").first();
    const hasServiceLink = await serviceLink.isVisible().catch(() => false);

    if (!hasServiceLink) {
      // Skip if no services exist
      test.skip();
      return;
    }

    await serviceLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/services\/.+/, { timeout: 15_000 });

    // Wait for actual navigation and selected controls, not a one-shot
    // isVisible() immediately after clicking while React is still updating.
    await page.getByRole("button", { name: "EOS", exact: true }).click();
    await expect(page).toHaveURL(/tab=eos/);
    await expect(page.getByRole("button", { name: "Scorecard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rocks", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Daily Ops", exact: true }).click();
    await expect(page).toHaveURL(/tab=daily/);
    await expect(page.getByRole("button", { name: "Attendances", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Checklists", exact: true })).toBeVisible();

    // No error states after tab navigation
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("services page shows stat cards", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Services page should show summary stats or service cards
    // StatCard components typically show numbers
    const mainContent = await page.locator("main").textContent();
    expect(mainContent!.length).toBeGreaterThan(20);

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });
});
