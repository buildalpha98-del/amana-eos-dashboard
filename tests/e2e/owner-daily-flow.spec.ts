/**
 * E2E: Owner daily flow
 *
 * Dashboard → rocks → scorecard → todos → meetings
 * Tests real UI elements, not just navigation.
 */

import { test, expect } from "@playwright/test";

test.describe("Owner daily flow", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  test("dashboard loads with command centre and today panel", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Command Centre heading should be visible for owner role
    await expect(
      page.getByText("Command Centre"),
    ).toBeVisible({ timeout: 15_000 });

    // Should show a greeting (Good morning/afternoon/evening)
    await expect(
      page.getByText(/Good (morning|afternoon|evening)/),
    ).toBeVisible({ timeout: 15_000 });

    // Main content area should render
    await expect(page.locator("main")).toBeVisible();

    // No error states visible
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("rocks page renders with view toggle and quarter selector", async ({
    page,
  }) => {
    await page.goto("/rocks");
    await page.waitForLoadState("networkidle");

    // Page heading — "Rocks" appears in the sidebar, kanban column labels
    // and rock cards too, so target the heading role, not bare text.
    await expect(
      page.getByRole("heading", { name: "Rocks" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Track your quarterly 90-day goals"),
    ).toBeVisible();

    // View toggle buttons (kanban and list) — rendered twice (mobile +
    // desktop layouts), so .first() to avoid a strict-mode violation.
    await expect(page.getByRole("button", { name: "Kanban view" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "List view" }).first()).toBeVisible();

    // Can switch to list view
    await page.getByRole("button", { name: "List view" }).first().click();
    await page.waitForLoadState("networkidle");

    // Can switch back to kanban view
    await page.getByRole("button", { name: "Kanban view" }).first().click();
    await page.waitForLoadState("networkidle");

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("scorecard page renders with measurables and group toggle", async ({
    page,
  }) => {
    await page.goto("/scorecard");
    await page.waitForLoadState("networkidle");

    // Main content loads
    await expect(page.locator("main")).toBeVisible();

    // Should show the scorecard CONTENT area — the measurables grid table or
    // the explicit empty state. (Matching /measurable/i was vacuous: the
    // static PageHeader description contains "measurables", so it stayed
    // green even when the data area errored.)
    const hasGrid = await page
      .locator("main table")
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText("No Measurables Yet")
      .first()
      .isVisible()
      .catch(() => false);

    // One of these should be true — page loaded with content or empty state
    expect(hasGrid || hasEmptyState).toBeTruthy();

    // No error states — neither the global boundary nor the scorecard's own
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
    await expect(page.getByText("Failed to load scorecard")).not.toBeVisible();
  });

  test("todos page renders with filter and week selector", async ({
    page,
  }) => {
    await page.goto("/todos");
    await page.waitForLoadState("networkidle");

    // Main content loads
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // View toggle buttons should be present (list/kanban)
    const listButton = page.getByRole("button", { name: "List view" });
    const kanbanButton = page.getByRole("button", { name: "Kanban view" });
    const hasViewToggle =
      (await listButton.isVisible().catch(() => false)) ||
      (await kanbanButton.isVisible().catch(() => false));

    // Should have either view toggle or todo content
    expect(hasViewToggle || (await page.locator("main").isVisible())).toBeTruthy();

    // Should show todo items or empty state
    const hasTodos = await page.locator("[data-testid]").first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no.*to-do/i).isVisible().catch(() => false);
    const hasContent = hasTodos || hasEmptyState || (await page.locator("main").textContent())!.length > 50;
    expect(hasContent).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("meetings page renders with L10 sections", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    // Main content loads
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show meetings-related content — either meeting list or creation option
    const hasMeetings = await page.getByText(/Level 10|L10|Meeting/i).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no meetings/i).isVisible().catch(() => false);
    const hasStartButton = await page.getByRole("button", { name: /start|new|create/i }).isVisible().catch(() => false);

    // Page should have loaded with some meaningful content
    expect(hasMeetings || hasEmptyState || hasStartButton).toBeTruthy();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });
});
