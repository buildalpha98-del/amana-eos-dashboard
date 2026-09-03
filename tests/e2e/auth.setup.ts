/**
 * Playwright auth setup — authenticates and saves session state.
 *
 * Wired as the `setup` project in playwright.config.ts, which the chromium
 * project depends on, so these run before any spec that does
 * `test.use({ storageState: ".playwright/auth/owner.json" })`.
 *
 * The login flow itself (including why it doesn't assert a landing URL, and
 * the welcome-tour stamp that must land before storage state is saved)
 * lives in helpers/session.ts, shared with every spec that logs in via the
 * UI.
 */

import { test as setup } from "@playwright/test";
import path from "path";
import { loginViaUi } from "./helpers/session";

const AUTH_DIR = path.join(__dirname, "../../.playwright/auth");

setup("authenticate as owner", async ({ page }) => {
  await loginViaUi(page, "test-owner@amana-test.local", {
    saveStatePath: path.join(AUTH_DIR, "owner.json"),
  });
});

setup("authenticate as staff", async ({ page }) => {
  await loginViaUi(page, "test-staff@amana-test.local", {
    saveStatePath: path.join(AUTH_DIR, "staff.json"),
  });
});

setup("authenticate as admin", async ({ page }) => {
  await loginViaUi(page, "test-admin@amana-test.local", {
    saveStatePath: path.join(AUTH_DIR, "admin.json"),
  });
});
