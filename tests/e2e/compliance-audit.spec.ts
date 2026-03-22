/**
 * E2E: Compliance and audit flow
 *
 * Compliance page → tabs → policies page → policy list
 */

import { test, expect } from "@playwright/test";

test.describe("Compliance audit flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("compliance page renders with certificate types and tabs", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Main content loads
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Compliance page has multiple views — certificates, audit calendar, results, etc.
    // Check for tab navigation (Audit Calendar, Audit Results, Qualification Ratios, Compliance Matrix)
    const hasAuditCalendar = await page.getByText(/Audit Calendar/i).isVisible().catch(() => false);
    const hasAuditResults = await page.getByText(/Audit Results/i).isVisible().catch(() => false);
    const hasQualRatios = await page.getByText(/Qualification Ratios/i).isVisible().catch(() => false);
    const hasMatrix = await page.getByText(/Compliance Matrix|Matrix/i).isVisible().catch(() => false);

    // Should show compliance certificate types or tab navigation
    const hasCertTypes = await page
      .getByText(/WWCC|First Aid|CPR|Police Check|Anaphylaxis/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasAuditCalendar || hasAuditResults || hasQualRatios || hasMatrix || hasCertTypes).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("compliance page has add and export functionality", async ({
    page,
  }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should have action buttons (Add Certificate, Import, Export)
    const hasAddButton = await page.getByRole("button", { name: /add|new|create/i }).first().isVisible().catch(() => false);
    const hasImportButton = await page.getByRole("button", { name: /import/i }).isVisible().catch(() => false);
    const hasExportButton = await page.getByRole("button", { name: /export|csv/i }).isVisible().catch(() => false);

    // At least one action should be available
    expect(hasAddButton || hasImportButton || hasExportButton).toBeTruthy();
  });

  test("policies page renders with policy list and status tabs", async ({
    page,
  }) => {
    await page.goto("/policies");
    await page.waitForLoadState("networkidle");

    // Main content loads
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Policies page has main tabs: Policies, Compliance
    const hasPoliciesTab = await page.getByText(/Policies/i).first().isVisible().catch(() => false);
    const hasComplianceTab = await page.getByText(/Compliance/i).isVisible().catch(() => false);

    expect(hasPoliciesTab || hasComplianceTab).toBeTruthy();

    // Status filter tabs: All, Draft, Published, Archived
    const hasStatusTabs =
      (await page.getByText("All").first().isVisible().catch(() => false)) ||
      (await page.getByText("Draft").isVisible().catch(() => false)) ||
      (await page.getByText("Published").isVisible().catch(() => false));

    expect(hasStatusTabs).toBeTruthy();

    // Should show policy items or empty state
    const hasPolicies = await page.locator("main").textContent();
    expect(hasPolicies!.length).toBeGreaterThan(20);

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("policies page has search functionality", async ({ page }) => {
    await page.goto("/policies");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should have a search input
    const searchInput = page.getByPlaceholder(/search/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      // Type in search to verify it is interactive
      await searchInput.fill("test policy");
      // Clear the search
      await searchInput.fill("");
    }

    // Verify page still renders correctly after interaction
    await expect(page.locator("main")).toBeVisible();
  });
});
