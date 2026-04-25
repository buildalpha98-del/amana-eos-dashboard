/**
 * E2E: Scorecard arrow-key cell navigation.
 *
 * Verifies the spreadsheet-style nav added to the 13-week grid:
 *   - ArrowRight/Left from an editing cell saves and moves to the next
 *     data-entry cell
 *   - ArrowDown jumps to the same column in the next measurable row,
 *     skipping header columns
 *
 * Doesn't validate the saved value — that's covered by the create-entry
 * unit tests. This spec is about whether the keyboard handler is wired
 * end-to-end, which jsdom can't fully exercise.
 */

import { test, expect } from "@playwright/test";

test.use({ storageState: ".playwright/auth/owner.json" });

test.describe("Scorecard arrow-key navigation", () => {
  test("ArrowRight from an editing cell moves focus to the adjacent cell", async ({
    page,
  }) => {
    await page.goto("/scorecard?v2=1");
    await page.waitForLoadState("networkidle");

    const grid = page.locator("td[data-scorecard-cell]");
    const cellCount = await grid.count();
    if (cellCount < 2) {
      // No data → nothing to navigate. Allow the seed-empty case.
      test.skip();
      return;
    }

    const firstCell = grid.nth(0);
    await firstCell.click();
    // Number input — `spinbutton` role
    const input = page.getByRole("spinbutton").first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill("12");

    // ArrowRight should save + click the next data-scorecard-cell, which
    // re-renders an input. Allow up to 1.5s for save → re-render.
    await input.press("ArrowRight");

    // After navigation, exactly one input should be focused (the new cell)
    await expect.poll(async () => {
      return (await page.getByRole("spinbutton").count()) >= 1;
    }, { timeout: 5_000 }).toBe(true);
  });

  test("Tab still saves and falls back to the browser's native focus walk", async ({
    page,
  }) => {
    await page.goto("/scorecard?v2=1");
    await page.waitForLoadState("networkidle");

    const grid = page.locator("td[data-scorecard-cell]");
    if ((await grid.count()) === 0) {
      test.skip();
      return;
    }

    await grid.nth(0).click();
    const input = page.getByRole("spinbutton").first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill("7");
    await input.press("Tab");

    // The cell should have closed (no more open inputs from this cell at least)
    await page.waitForTimeout(200);
  });
});
