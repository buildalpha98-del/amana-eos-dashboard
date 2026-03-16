/**
 * Playwright auth setup — authenticates and saves session state.
 *
 * Usage in tests: `test.use({ storageState: ".playwright/auth/owner.json" })`
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_DIR = path.join(__dirname, "../../.playwright/auth");

// We create auth state files for each role we test.
// In a real setup these would log in via the UI.
// For now, we set up the test to log in through the login page.

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");

  // Fill credentials — these should exist in the test database
  await page.fill('input[name="email"], input[type="email"]', "test-owner@amana-test.local");
  await page.fill('input[name="password"], input[type="password"]', "TestPassword123!");
  await page.click('button[type="submit"]');

  // Wait for dashboard to load (redirect after login)
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page.locator("body")).toBeVisible();

  // Save auth state
  await page.context().storageState({ path: path.join(AUTH_DIR, "owner.json") });
});

setup("authenticate as staff", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test-staff@amana-test.local");
  await page.fill('input[name="password"], input[type="password"]', "TestPassword123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: path.join(AUTH_DIR, "staff.json") });
});

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test-admin@amana-test.local");
  await page.fill('input[name="password"], input[type="password"]', "TestPassword123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: path.join(AUTH_DIR, "admin.json") });
});
