import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs/promises";
import {
  seedParent,
  saveParentSession,
  cleanupParent,
  disconnect,
  type SeededParent,
} from "./helpers/seed-parent-portal";

const STORAGE_STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".playwright",
  "auth",
  "parent-portal.json",
);

let seeded: SeededParent;

test.beforeAll(async () => {
  seeded = await seedParent({});
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await saveParentSession(seeded, STORAGE_STATE_PATH);
});

test.afterAll(async () => {
  if (seeded) await cleanupParent(seeded);
  await disconnect();
  await fs.unlink(STORAGE_STATE_PATH).catch(() => {});
});

test.describe("Parent portal — unauthenticated", () => {
  test("login page renders the magic-link form", async ({ page }) => {
    await page.goto("/parent/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /send|continue|link|sign/i })).toBeVisible();
  });

  test("POST send-link returns success for a known email", async ({ request }) => {
    const res = await request.post("/api/parent/auth/send-link", {
      data: { email: seeded.email },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST send-link returns success for an unknown email (no enumeration)", async ({ request }) => {
    // Use a unique unknown email each run — /api/parent/auth/send-link is rate
    // limited 3/hour per email address, and Upstash persists state between
    // runs, so a hard-coded address would become flaky.
    const unknown = `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
    const res = await request.post("/api/parent/auth/send-link", {
      data: { email: unknown },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

test.describe("Parent portal — authenticated round-trip", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test("home page renders after auth", async ({ page }) => {
    await page.goto("/parent");
    await expect(page).toHaveURL(/\/parent\/?$/);
    await expect(page.locator("header, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("children list shows seeded child", async ({ page }) => {
    await page.goto("/parent/children");
    await expect(page.getByText("E2EChild", { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  test("child detail page loads without error", async ({ page }) => {
    await page.goto(`/parent/children/${seeded.childId}`);
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
    await expect(page.getByText(/something went wrong|500/i)).toHaveCount(0);
  });

  test("messages page loads", async ({ page }) => {
    await page.goto("/parent/messages");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|500/i)).toHaveCount(0);
  });

  test("account page loads and form is present", async ({ page }) => {
    await page.goto("/parent/account");
    await expect(page.locator("form, input").first()).toBeVisible({ timeout: 10_000 });
  });

  test("logout clears the session and returns to /parent/login", async ({ page, context }) => {
    await page.goto("/parent");
    const logout = page.getByRole("button", { name: /log ?out/i });
    await logout.waitFor({ state: "visible", timeout: 10_000 });
    await logout.click();
    await expect(page).toHaveURL(/\/parent\/login/, { timeout: 10_000 });
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "parent-session");
    expect(session?.value ?? "").toBe("");
  });
});
