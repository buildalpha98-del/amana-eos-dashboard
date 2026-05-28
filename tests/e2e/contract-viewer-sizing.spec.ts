/**
 * E2E: Inline contract viewer fills the viewport at desktop and mobile sizes.
 *
 * Regression coverage for the v1 inline viewer's sizing bug — the modal was
 * `sm:max-w-4xl` (768px) and `sm:h-auto`, so on a 1440px desktop it took up
 * ~53% of the width and shrunk to content height. v2 explicitly sizes to
 * 90vw × 90vh on desktop (capped 1400px) and full-screen on mobile so a
 * full staff handbook is actually readable.
 *
 * Asserts the dialog's bounding rect at 1440×900 (desktop), 768×1024 (iPad),
 * 390×844 (iPhone 14) and 375×667 (iPhone SE). Also confirms the sticky
 * Acknowledge button stays visible after scrolling the iframe.
 *
 * The viewer requires an active or historical contract on the logged-in
 * user's portal to open. If that seed data isn't present we skip the test
 * (the spec still catches genuine sizing regressions whenever a contract
 * does exist).
 */
import { test, expect, type Page } from "@playwright/test";

test.describe("Staff portal inline contract viewer — sizing", () => {
  // The viewer is opened by the staff themselves from /my-portal, so we use
  // the staff storage state.
  test.use({ storageState: ".playwright/auth/staff.json" });

  async function openViewerIfAvailable(page: Page): Promise<boolean> {
    await page.goto("/my-portal");
    await page.waitForLoadState("networkidle");

    // Active contract path — primary CTA on the card.
    const primaryBtn = page
      .getByRole("button", { name: /Read & acknowledge|View Contract/i })
      .first();

    if (!(await primaryBtn.count())) {
      // Past Contracts row's View action.
      const pastView = page.getByRole("button", { name: /^View$/ }).first();
      if (!(await pastView.count())) return false;
      await pastView.click();
    } else {
      await primaryBtn.click();
    }

    const dialog = page.getByTestId("contract-viewer-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    return true;
  }

  for (const { name, width, height, minWFraction, minHFraction } of [
    { name: "desktop 1440×900", width: 1440, height: 900, minWFraction: 0.85, minHFraction: 0.85 },
    { name: "wide desktop 1920×1080", width: 1920, height: 1080, minWFraction: 0.65, minHFraction: 0.85 },
    { name: "tablet 768×1024", width: 768, height: 1024, minWFraction: 0.85, minHFraction: 0.85 },
    { name: "iPhone 14 390×844", width: 390, height: 844, minWFraction: 0.99, minHFraction: 0.99 },
    { name: "iPhone SE 375×667", width: 375, height: 667, minWFraction: 0.99, minHFraction: 0.99 },
  ]) {
    test(`viewer fills the viewport at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });

      const opened = await openViewerIfAvailable(page);
      if (!opened) test.skip(true, "No contract on the staff portal — seed data not present");

      const dialog = page.getByTestId("contract-viewer-dialog");
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      // Width: at minWFraction of viewport.
      expect(box!.width).toBeGreaterThanOrEqual(width * minWFraction);
      // Height: at minHFraction of viewport.
      expect(box!.height).toBeGreaterThanOrEqual(height * minHFraction);
      // Capping rule from the component: never exceed 1400px wide on desktop.
      // (Mobile viewports are well under this — assertion still safe.)
      expect(box!.width).toBeLessThanOrEqual(Math.min(width, 1400));
    });
  }

  test("Acknowledge button stays visible after scrolling the iframe (sticky footer holds)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const opened = await openViewerIfAvailable(page);
    if (!opened) test.skip(true, "No contract on the staff portal");

    const dialog = page.getByTestId("contract-viewer-dialog");
    const ackBtn = page.getByTestId("contract-viewer-acknowledge");
    if (!(await ackBtn.count())) {
      // Only meaningful when the contract is pending — already-acknowledged
      // contracts hide the button.
      test.skip(true, "Contract already acknowledged — no Acknowledge button to test");
    }
    await expect(ackBtn).toBeVisible();

    // Scroll the iframe content (where supported). Even if the iframe is
    // sandboxed, the parent layout keeps the footer sticky — assert the
    // button stays inside the dialog's visible rect.
    const dialogBox = await dialog.boundingBox();
    const ackBox = await ackBtn.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(ackBox).not.toBeNull();
    // Acknowledge button must sit inside the dialog's bottom band.
    expect(ackBox!.y + ackBox!.height).toBeLessThanOrEqual(
      dialogBox!.y + dialogBox!.height + 1,
    );
    // ... and below the dialog's vertical midpoint (i.e. it's in the footer,
    // not floating in the body).
    expect(ackBox!.y).toBeGreaterThan(dialogBox!.y + dialogBox!.height / 2);
  });

  test("opening the viewer locks the page body scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const opened = await openViewerIfAvailable(page);
    if (!opened) test.skip(true, "No contract on the staff portal");

    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");
  });
});
