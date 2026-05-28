/**
 * E2E: Admin staff profile edit flow.
 *
 * Regression coverage for the v1 release's bug: the "Edit profile" Quick
 * Action in the staff profile header was permanently disabled, making the
 * edit affordance invisible to owners/admins even though the underlying
 * PersonalTab edit form existed.
 *
 * The unit tests passed at v1 because they tested the PATCH endpoint and
 * the form's render path — they never exercised the actual user journey
 * "click the obvious Edit affordance from the staff page header." This
 * spec covers that.
 *
 * Flow:
 *   1. Login as owner (storageState).
 *   2. Navigate to /team → first staff row → staff detail page.
 *   3. Verify "Edit profile" Quick Action exists AND is enabled.
 *   4. Click it.
 *   5. Verify Personal-details edit form opens (look for an editable input
 *      labelled "Full name" or "Phone").
 *   6. Change phone to a known sentinel value.
 *   7. Save.
 *   8. Reload the page.
 *   9. Verify the sentinel value persisted.
 *   10. Reset phone to original value so the next run starts clean.
 */
import { test, expect } from "@playwright/test";

test.describe("Admin staff profile — edit flow", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("Quick Action Edit profile is enabled and opens the editor", async ({ page }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    // Click the first staff member's name link. The team list renders each
    // row's name as a Link to /staff/[id].
    const firstStaffLink = page
      .locator('a[href^="/staff/"]')
      .filter({ hasNotText: "" })
      .first();

    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team — seed data not present");
    }
    await firstStaffLink.click();

    // Wait for the staff detail page.
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // The Quick Actions sidebar should contain an enabled "Edit profile" button.
    const editBtn = page
      .locator('[data-testid="staff-profile-quick-actions"]')
      .getByRole("button", { name: /Edit profile/i });
    await expect(editBtn).toBeVisible();
    await expect(editBtn).toBeEnabled();
  });

  test("clicking Edit profile opens the Personal-details editor", async ({ page }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });

    const editBtn = page
      .locator('[data-testid="staff-profile-quick-actions"]')
      .getByRole("button", { name: /Edit profile/i });
    await editBtn.click();

    // After clicking we should land in edit mode: Cancel + Save buttons
    // appear and the Phone input is editable.
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /^Cancel$/ })).toBeVisible();
    // The form has a Full name field (admin-only, but owners are admins).
    await expect(page.getByText("Full name").first()).toBeVisible();
  });

  test("admin can edit a staff member's phone and the change persists round-trip", async ({ page }) => {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const firstStaffLink = page.locator('a[href^="/staff/"]').first();
    if (!(await firstStaffLink.count())) {
      test.skip(true, "No staff rows on /team");
    }
    await firstStaffLink.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });

    // Capture the URL so we can reload and verify persistence on the same record.
    const staffUrl = page.url();

    await page
      .locator('[data-testid="staff-profile-quick-actions"]')
      .getByRole("button", { name: /Edit profile/i })
      .click();

    // Stash original phone so we can restore it at the end.
    const phoneInput = page
      .locator("label")
      .filter({ hasText: /^Phone$/ })
      .locator("input");
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    const originalPhone = (await phoneInput.inputValue()) ?? "";

    // Sentinel value that's unlikely to collide with any real number.
    const sentinel = `0400 99${Math.floor(Math.random() * 9000) + 1000}`;
    await phoneInput.fill(sentinel);
    await page.getByRole("button", { name: /^Save$/ }).click();

    // Wait for the toast indicating success + the form closing.
    await expect(
      page.getByRole("button", { name: /^Save$/ }),
    ).not.toBeVisible({ timeout: 15_000 });

    // Hard reload — verify the value actually round-tripped through the API.
    await page.goto(staffUrl);
    await page.waitForLoadState("networkidle");

    // Switch to the Personal-details sub-tab (default is Employment-details).
    const personalTabPill = page.getByRole("tab", { name: /Personal details/i });
    if (await personalTabPill.isVisible().catch(() => false)) {
      await personalTabPill.click();
    }
    await expect(page.getByText(sentinel).first()).toBeVisible({
      timeout: 10_000,
    });

    // Restore the original value so the next test run starts clean.
    await page
      .locator('[data-testid="staff-profile-quick-actions"]')
      .getByRole("button", { name: /Edit profile/i })
      .click();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(originalPhone);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(
      page.getByRole("button", { name: /^Save$/ }),
    ).not.toBeVisible({ timeout: 15_000 });
  });
});
