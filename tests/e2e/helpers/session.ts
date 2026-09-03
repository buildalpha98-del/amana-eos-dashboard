/**
 * Shared session helpers for specs that log in via the UI.
 *
 * auth.setup.ts, contract-templates.spec.ts, and smoke-console-axe.spec.ts
 * each hand-rolled this flow before the 2026-09-02 nightly repair — and the
 * tour-flag stamp had to be patched in all three when the welcome tour
 * started blocking clicks. One implementation here keeps the next
 * login-page change (or tour-key rename) from silently breaking a subset
 * of the suite.
 */

import type { Page } from "@playwright/test";
import { TOUR_STORAGE_KEY } from "../../../src/lib/tour-storage";

export const TEST_PASSWORD = "TestPassword123!";

/**
 * Stamp the welcome tour as completed. The tour modal
 * (OnboardingTourWrapper, dashboard layout) opens 1.5s after load for any
 * context without this localStorage flag and overlays the whole page, so
 * every click in every spec would hang until the test timeout. Call this
 * after login and BEFORE saving storage state — storageState captures
 * localStorage per origin, so the stamp propagates to every context
 * restored from that file.
 */
export async function dismissWelcomeTour(page: Page): Promise<void> {
  await page.evaluate(
    (key) => localStorage.setItem(key, "true"),
    TOUR_STORAGE_KEY,
  );
}

/**
 * Log in via the UI and dismiss the welcome tour.
 *
 * Deliberately does NOT assert a specific landing URL. Where you land is
 * role-dependent — see getPostLoginPath in src/app/(auth)/login/page.tsx:
 * `staff`/`member` with a serviceId go to /services/{serviceId}?tab=today,
 * EOS roles go to /rocks, and everyone else goes to /dashboard. Leaving
 * /login is the actual signal we care about: the credentials were accepted
 * and a session cookie exists.
 *
 * Pass `saveStatePath` to also persist the session for
 * `test.use({ storageState })`.
 */
export async function loginViaUi(
  page: Page,
  email: string,
  {
    password = TEST_PASSWORD,
    saveStatePath,
  }: { password?: string; saveStatePath?: string } = {},
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });

  await dismissWelcomeTour(page);

  if (saveStatePath) {
    await page.context().storageState({ path: saveStatePath });
  }
}
