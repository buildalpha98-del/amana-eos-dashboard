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

  // The settings page is split into sections (Organisation / People & access
  // / Integrations / Communications / System) behind a section nav. The nav
  // buttons render twice (mobile + desktop), so filter to the visible one.
  const settingsSection = (page: import("@playwright/test").Page, name: string) =>
    page.getByRole("button", { name }).filter({ visible: true }).first();

  test("settings page renders with organisation settings", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Default section is Organisation. getByText("Organisation Settings")
    // also matches the page subtitle ("Organisation settings, integrations,
    // and user management") — target the heading.
    await expect(
      page.getByRole("heading", { name: "Organisation Settings" }),
    ).toBeVisible({ timeout: 15_000 });

    // Should see Organisation Name field
    await expect(
      page.getByText("Organisation Name"),
    ).toBeVisible();

    // API Keys moved into the Integrations section (owner only)
    await settingsSection(page, "Integrations").click();
    await expect(
      page.getByRole("heading", { name: "API Keys" }),
    ).toBeVisible({ timeout: 15_000 });

    // User management (with invites) lives under People & access
    await settingsSection(page, "People & access").click();
    await expect(
      page.getByRole("heading", { name: "User Management" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /invite user/i }).first(),
    ).toBeVisible();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("settings page has permissions panel for owner", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Role permissions is a card under People & access that links to the
    // page-by-page access matrix at /settings/permissions.
    await settingsSection(page, "People & access").click();
    const permissionsLink = page.getByRole("link", { name: /role permissions/i }).first();
    await expect(permissionsLink).toBeVisible({ timeout: 15_000 });

    await permissionsLink.click();
    await page.waitForURL(/settings\/permissions/);
    await expect(
      page.getByText(/role permissions/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // /team was rebuilt as the employee directory (search + filter + table);
  // the accountability chart moved to its own /accountability-chart page.
  test("team page renders the employee directory", async ({
    page,
  }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: "Team" }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Search + export affordances
    await expect(page.getByRole("searchbox", { name: /search employees/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export|csv/i }).first(),
    ).toBeVisible();

    // Should show the employee table (Name/Role/Service/Status columns)
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("accountability chart page renders the org structure", async ({
    page,
  }) => {
    await page.goto("/accountability-chart");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: /accountability chart/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Seat cards render (Visionary/Integrator are the canonical EOS roots)
    await expect(page.getByText("Visionary").first()).toBeVisible();
    await expect(page.getByText("Integrator").first()).toBeVisible();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
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
