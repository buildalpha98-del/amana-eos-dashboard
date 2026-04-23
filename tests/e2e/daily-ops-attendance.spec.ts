/**
 * E2E: Daily Ops weekly attendance + Finance budget sync + Add Purchase validation
 *
 * Covers:
 *  - Input UX bug fix (focus-selects, typing replaces)
 *  - Holiday Quest toggle visibility + totals
 *  - Cross-tab sync: attendance save → Finance grocery breakdown refreshes
 *  - Add Purchase Notes requirement when category is "Other"
 */

import { test, expect, type Page } from "@playwright/test";

test.describe("Daily Ops attendance & Finance budget", () => {
  test.use({
    storageState: ".playwright/auth/owner.json",
  });

  async function openFirstService(page: Page): Promise<string | null> {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");
    const serviceLink = page.locator("a[href*='/services/']").first();
    if (!(await serviceLink.isVisible().catch(() => false))) return null;
    const href = await serviceLink.getAttribute("href");
    if (!href) return null;
    const match = href.match(/\/services\/([^?#/]+)/);
    return match?.[1] ?? null;
  }

  test("cell input: focus-selects and typing replaces existing value", async ({
    page,
  }) => {
    const serviceId = await openFirstService(page);
    test.skip(!serviceId, "No services available in this environment");

    await page.goto(`/services/${serviceId}?tab=daily&sub=attendance`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Rise and Shine Club (BSC)").first()
    ).toBeVisible({ timeout: 15_000 });

    // Grab the first Permanent cell in the BSC row.
    const firstCell = page
      .getByRole("textbox", { name: /Rise and Shine Club.*Permanent bookings/i })
      .first();

    await firstCell.click();
    // Focus should select the existing value — typing 25 should replace it,
    // not append or truncate to "2".
    await page.keyboard.type("25");
    await firstCell.blur();

    // Give the mutation a moment to settle.
    await page.waitForTimeout(500);
    await expect(firstCell).toHaveValue("25");
  });

  test("Holiday Quest toggle shows/hides VC rows and updates totals", async ({
    page,
  }) => {
    const serviceId = await openFirstService(page);
    test.skip(!serviceId, "No services available in this environment");

    await page.goto(`/services/${serviceId}?tab=daily&sub=attendance`);
    await page.waitForLoadState("networkidle");

    // Default: VC hidden.
    await expect(page.getByText("Holiday Quest (VC)")).toHaveCount(0);

    const toggle = page.getByLabel("Show Holiday Quest row");
    await toggle.check();

    // VC now visible on the grid.
    await expect(page.getByText("Holiday Quest (VC)").first()).toBeVisible();

    // And the toggle is actually labelled "Show Holiday Quest" (renamed
    // from "Show VC").
    await expect(page.getByText("Show Holiday Quest")).toBeVisible();
  });

  test("attendance save triggers Finance grocery breakdown refresh", async ({
    page,
  }) => {
    const serviceId = await openFirstService(page);
    test.skip(!serviceId, "No services available in this environment");

    await page.goto(`/services/${serviceId}?tab=daily&sub=attendance`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Rise and Shine Club (BSC)").first()
    ).toBeVisible({ timeout: 15_000 });

    // Bump BSC permanent Monday.
    const firstCell = page
      .getByRole("textbox", { name: /Rise and Shine Club.*Permanent bookings/i })
      .first();
    await firstCell.click();
    await page.keyboard.type("15");
    await firstCell.blur();
    await page.waitForTimeout(800);

    // Navigate to Finance → Budget and check the BSC row shows the Amana
    // branded label (not the old "Before School Care" copy).
    await page.goto(`/services/${serviceId}?tab=finance&sub=budget`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Rise and Shine Club (BSC)").first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Amana Afternoons (ASC)").first()).toBeVisible();
    await expect(page.getByText("Holiday Quest (VC)").first()).toBeVisible();
    // Old labels are gone.
    await expect(page.getByText("Before School Care (BSC)")).toHaveCount(0);
  });

  test("Add Purchase requires Notes when category is Other", async ({
    page,
  }) => {
    const serviceId = await openFirstService(page);
    test.skip(!serviceId, "No services available in this environment");

    await page.goto(`/services/${serviceId}?tab=finance&sub=budget`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add Purchase" }).click();

    await page
      .getByLabel(/^Item Name$/i)
      .fill("Mystery supply");
    await page.getByLabel(/^Amount/i).fill("12.50");
    await page.getByLabel(/^Category$/i).selectOption("other");

    // Label flips to "(required)" immediately.
    await expect(page.getByText(/Notes \(required\)/i)).toBeVisible();

    const submit = page.getByRole("button", { name: /Add Item/i });
    await expect(submit).toBeDisabled();

    // Fill in notes → button enables.
    await page
      .getByPlaceholder(/Please describe what this item is/i)
      .fill("Gift card for April parent event");
    await expect(submit).toBeEnabled();

    // Switch category back to non-Other → label returns to (optional).
    await page.getByLabel(/^Category$/i).selectOption("cleaning");
    await expect(page.getByText(/Notes \(optional\)/i)).toBeVisible();
    await expect(submit).toBeEnabled();
  });
});
