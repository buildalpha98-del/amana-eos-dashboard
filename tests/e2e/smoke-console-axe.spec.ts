/**
 * Cheap quality gate: load the highest-traffic pages and fail on
 *   1. console errors (a fresh page load must be silent — duplicate React
 *      keys, hydration mismatches, and crashed widgets all surface here),
 *   2. the global error boundary ("Something went wrong"),
 *   3. CRITICAL axe-core violations (serious ones are logged, not fatal,
 *      so the nightly doesn't go perma-red while the backlog is worked off).
 *
 * Self-contained: logs in through the UI once (no storageState dependency),
 * then walks the pages in a single session.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SMOKE_PAGES = ["/dashboard", "/services", "/compliance", "/team"];

const EMAIL = process.env.E2E_EMAIL || process.env.ADMIN_EMAIL || "admin@amanaoshc.com.au";
const PASSWORD = process.env.E2E_PASSWORD || process.env.ADMIN_PASSWORD || "ChangeMe123!";

// Console noise that isn't a product defect.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[HMR\]|\[Fast Refresh\]/i,
  /chrome-extension:/i,
  // Aborted fetches when we navigate away mid-request.
  /net::ERR_ABORTED/i,
  // Bare resource-load failures carry no URL in the console text — the
  // high-signal version is captured via page.on("requestfailed") below,
  // which fails the smoke only for same-origin /api requests.
  /^Failed to load resource/i,
];

test.describe("smoke: console + axe on key pages", () => {
  test("key pages load silently and pass critical a11y checks", async ({ page }) => {
    test.slow(); // 4 pages + axe scans in one session

    // ── Login via the UI ────────────────────────────────────
    await page.goto("/login");
    await page.getByPlaceholder("you@amanaoshc.com.au").fill(EMAIL);
    await page.getByPlaceholder("Enter your password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 30_000 });

    for (const path of SMOKE_PAGES) {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedApiRequests: string[] = [];
      const onConsole = (msg: { type(): string; text(): string }) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
        consoleErrors.push(text);
      };
      const onPageError = (err: Error) => pageErrors.push(err.message);
      const onRequestFailed = (req: { url(): string; failure(): { errorText: string } | null }) => {
        const url = req.url();
        const failure = req.failure()?.errorText ?? "";
        if (failure.includes("ERR_ABORTED")) return; // navigated away mid-request
        // Only same-origin API calls are hard signal — third-party fonts,
        // avatars, and analytics flake in headless environments.
        if (/\/api\//.test(new URL(url).pathname) === false) return;
        failedApiRequests.push(`${url} → ${failure}`);
      };
      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("requestfailed", onRequestFailed);

      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Give client widgets a beat to hydrate and fetch.
      await page.waitForTimeout(1500);

      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);

      // 1. A fresh load must be silent: no console errors, no uncaught JS
      //    exceptions, no failed same-origin API calls.
      expect
        .soft(consoleErrors, `${path} logged console errors:\n${consoleErrors.join("\n")}`)
        .toHaveLength(0);
      expect
        .soft(pageErrors, `${path} threw uncaught exceptions:\n${pageErrors.join("\n")}`)
        .toHaveLength(0);
      expect
        .soft(failedApiRequests, `${path} had failed API requests:\n${failedApiRequests.join("\n")}`)
        .toHaveLength(0);

      // 2. The error boundary didn't catch a crash.
      await expect
        .soft(page.getByText("Something went wrong"), `${path} hit the error boundary`)
        .not.toBeVisible();

      // 3. Axe: critical violations fail; serious are logged for triage.
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const critical = axe.violations.filter((v) => v.impact === "critical");
      const serious = axe.violations.filter((v) => v.impact === "serious");
      if (serious.length > 0) {
        console.warn(
          `[axe] ${path} — ${serious.length} serious violation(s) (non-fatal):\n` +
            serious.map((v) => `  ${v.id}: ${v.help} (${v.nodes.length} nodes)`).join("\n"),
        );
      }
      expect
        .soft(
          critical,
          `${path} has CRITICAL axe violations:\n` +
            critical.map((v) => `  ${v.id}: ${v.help} (${v.nodes.length} nodes)`).join("\n"),
        )
        .toHaveLength(0);
    }
  });
});
