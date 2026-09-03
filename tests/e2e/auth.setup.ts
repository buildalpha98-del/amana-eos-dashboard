/**
 * Playwright auth setup — authenticates and saves session state.
 *
 * Wired as the `setup` project in playwright.config.ts, which the chromium
 * project depends on, so these run before any spec that does
 * `test.use({ storageState: ".playwright/auth/owner.json" })`.
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_DIR = path.join(__dirname, "../../.playwright/auth");
const PASSWORD = "TestPassword123!";

/**
 * Log in and persist the session.
 *
 * Deliberately does NOT assert a specific landing URL. Where you land is
 * role-dependent — see getPostLoginPath in src/app/(auth)/login/page.tsx:
 * `staff`/`member` with a serviceId go to /services/{serviceId}?tab=today,
 * EOS roles go to /rocks, and everyone else goes to /dashboard. This file
 * previously waited on "**\/dashboard" for all three roles, so the staff
 * login timed out even though it had authenticated fine — and because setup
 * is a dependency, that one failure blocked all 130 specs from running.
 *
 * Leaving /login is the actual signal we care about: it means the credentials
 * were accepted and a session cookie exists, which is all the saved state
 * needs to be valid.
 */
async function loginAndSaveState(
  page: import("@playwright/test").Page,
  email: string,
  stateFile: string,
) {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await expect(page.locator("body")).toBeVisible();

  // Mark the welcome tour as completed BEFORE saving state. The tour modal
  // (OnboardingTourWrapper, dashboard layout) opens 1.5s after load for any
  // context without this localStorage flag and overlays the whole page, so
  // every click in every spec would hang until the test timeout.
  // storageState captures localStorage per origin, so stamping it here
  // propagates to all contexts restored from this file.
  await page.evaluate(() => localStorage.setItem("amana-tour-completed", "true"));

  await page.context().storageState({ path: path.join(AUTH_DIR, stateFile) });
}

setup("authenticate as owner", async ({ page }) => {
  await loginAndSaveState(page, "test-owner@amana-test.local", "owner.json");
});

setup("authenticate as staff", async ({ page }) => {
  await loginAndSaveState(page, "test-staff@amana-test.local", "staff.json");
});

setup("authenticate as admin", async ({ page }) => {
  await loginAndSaveState(page, "test-admin@amana-test.local", "admin.json");
});
