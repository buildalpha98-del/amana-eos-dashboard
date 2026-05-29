/**
 * E2E: file viewer opens inline (not in a new tab) across all admin staff
 * profile sub-tabs that surface uploaded files.
 *
 * Regression coverage for the v1+v2 misses:
 *   - v1 added View+Download to Documents but kept new-tab links.
 *   - v2 added the same to Certifications/Qualifications, also new-tab.
 *   - This branch adds an in-app modal (FileViewerModal) used by every tab.
 *
 * For each tab we open the modal, assert the dialog appears in the same
 * tab (no popup), confirm it's pointing at the auth-checked proxy, and
 * then close it. Specs skip gracefully when seed data lacks files.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

test.describe("Admin staff profile — inline file viewer", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  async function gotoFirstStaff(page: Page): Promise<boolean> {
    await page.goto("/team");
    await page.waitForLoadState("networkidle");
    const link = page.locator('a[href^="/staff/"]').first();
    if (!(await link.count())) return false;
    await link.click();
    await page.waitForURL(/\/staff\/[^/]+/, { timeout: 15_000 });
    return true;
  }

  async function expectViewerOpens(
    page: Page,
    trigger: Locator,
    expectedUrlPrefix: RegExp,
  ) {
    await trigger.click();
    const dialog = page.getByTestId("file-viewer-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // The dialog body is either an iframe or img. Either way, its src/srcdoc
    // points at the proxy URL.
    const iframe = page.getByTestId("file-viewer-iframe");
    const image = page.getByTestId("file-viewer-image");
    const src =
      (await iframe.getAttribute("src").catch(() => null)) ??
      (await image.getAttribute("src").catch(() => null));
    expect(src).not.toBeNull();
    expect(src!).toMatch(expectedUrlPrefix);
    // Close so the next assertion starts clean.
    await page.getByTestId("file-viewer-close").click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  }

  test("Documents tab: filename and View button both open the modal in-app", async ({ page }) => {
    if (!(await gotoFirstStaff(page))) test.skip(true, "No staff seeded");

    await page.getByRole("tab", { name: /^Documents$/ }).click();

    const viewBtn = page.getByTestId("document-view-button").first();
    if (!(await viewBtn.count())) {
      test.skip(true, "No documents uploaded for this staff");
    }
    await expectViewerOpens(page, viewBtn, /^\/api\/staff-documents\//);

    const titleBtn = page.getByTestId("document-title-button").first();
    await expectViewerOpens(page, titleBtn, /^\/api\/staff-documents\//);
  });

  test("Certifications tab — Qualifications: name and View both open the modal", async ({ page }) => {
    if (!(await gotoFirstStaff(page))) test.skip(true, "No staff seeded");

    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    const viewBtn = page.getByTestId("qualification-view-button").first();
    if (!(await viewBtn.count())) {
      test.skip(true, "No qualifications with files seeded");
    }
    await expectViewerOpens(page, viewBtn, /^\/api\/qualifications\//);

    const nameBtn = page.getByTestId("qualification-name-button").first();
    await expectViewerOpens(page, nameBtn, /^\/api\/qualifications\//);
  });

  test("Certifications tab — Compliance cert View button opens the modal", async ({ page }) => {
    if (!(await gotoFirstStaff(page))) test.skip(true, "No staff seeded");

    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    const viewBtn = page.getByTestId("cert-view-button").first();
    if (!(await viewBtn.count())) {
      test.skip(true, "No compliance certs with files seeded");
    }
    await expectViewerOpens(page, viewBtn, /^\/api\/compliance\//);
  });

  test("Certifications tab — certs without files show 'No file attached' badge instead of a hidden affordance", async ({ page }) => {
    if (!(await gotoFirstStaff(page))) test.skip(true, "No staff seeded");

    await page.getByRole("tab", { name: /^Certifications$/ }).click();

    // If there's any cert/qualification with no file, the explicit badge
    // should be visible. This prevents the v1+v2 confusion where a label
    // that looked like a filename gave users false hope there was a file
    // to view.
    const badges = page
      .getByTestId("cert-no-file-badge")
      .or(page.getByTestId("qualification-no-file-badge"));
    if (!(await badges.count())) {
      test.skip(true, "All certs/quals have files attached on this profile");
    }
    await expect(badges.first()).toBeVisible();
    await expect(badges.first()).toContainText(/No file attached/i);
  });

  test("Contracts tab: View PDF opens the modal via the auth-checked proxy (not the raw blob URL)", async ({ page }) => {
    if (!(await gotoFirstStaff(page))) test.skip(true, "No staff seeded");

    await page.getByRole("tab", { name: /^Contracts$/ }).click();

    // Expand the first contract row so the "View PDF" button is visible.
    const row = page.locator("button:has-text('Active')").first();
    if (!(await row.count())) {
      // The list may render in a different shape — just try expanding the
      // first row whose label looks like a contract.
      const anyRow = page.locator('main button[role="button"], main button').first();
      if (!(await anyRow.count())) test.skip(true, "No contracts seeded");
      await anyRow.click();
    } else {
      await row.click();
    }

    const viewBtn = page.getByTestId("contract-view-button").first();
    if (!(await viewBtn.count())) {
      test.skip(true, "No contracts with documents seeded");
    }
    await expectViewerOpens(page, viewBtn, /^\/api\/contracts\//);
  });
});
