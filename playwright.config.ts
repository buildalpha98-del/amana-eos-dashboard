import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Minimal dotenv parser — loads .env files for Prisma-based test helpers.
// Precedence mirrors Next.js: values from .env.local win over .env.
function loadEnvFile(file: string) {
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, "utf8");
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  timeout: 60_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        // e2e/dev-only: skip Chromium-based PDF rendering so the contract-issue
        // route works without launching a nested browser during local dev tests.
        // In CI the dev server is not started (webServer is undefined above) so
        // the test runner must set MOCK_PDF=1 in the environment itself, e.g.:
        //   MOCK_PDF=1 npm run test:e2e
        env: {
          ...process.env,
          MOCK_PDF: "1",
        },
      },
});
