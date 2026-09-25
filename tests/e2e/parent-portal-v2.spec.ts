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

/**
 * End-to-end coverage for the parent portal.
 *
 * 2026-09-25: the v1/v2 split is gone. NEXT_PUBLIC_PARENT_PORTAL_V2 was never
 * set in production, so the V2 components had never rendered for a family;
 * they and the `useV2Flag` hook (including its `?v2=1` URL override) have been
 * deleted. The `?v2=1` query params below are now inert — harmless, and left
 * in place only where removing them would churn an otherwise passing test.
 * The specs that asserted V2-ONLY UI (the bookings segmented control + FAB,
 * the getting-started checklist page, and the v1/v2 switcher itself) are gone
 * with the code they covered.
 */

const STORAGE_STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".playwright",
  "auth",
  "parent-portal-v2.json",
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

test.describe("Parent Portal v2 — authenticated", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test("home v2 renders greeting + upcoming sessions", async ({ page }) => {
    await page.goto("/parent?v2=1");
    // "Welcome back, <name>" hero
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // The quick-actions block was replaced by the Upcoming Sessions region
    await expect(
      page.getByRole("heading", { name: /upcoming sessions/i }),
    ).toBeVisible();
  });

  test("child detail v2 shows the profile sections", async ({ page }) => {
    await page.goto(`/parent/children/${seeded.childId}?v2=1`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // The hero + 14-day strip became a profile layout (About / Care needs)
    await expect(page.getByText(/care needs/i).first()).toBeVisible();
    await expect(page.getByText(/medical conditions/i).first()).toBeVisible();
  });

  test("messages v2 list renders", async ({ page }) => {
    await page.goto("/parent/messages?v2=1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Either conversation rows OR empty state
    const hasEmpty = await page
      .getByText(/no conversations yet/i)
      .isVisible()
      .catch(() => false);
    const hasRow = await page
      .getByRole("link", { name: /./ })
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasEmpty || hasRow).toBe(true);
  });

  test("account page shows the editable profile fields", async ({ page }) => {
    await page.goto("/parent/account?v2=1");
    await expect(page.getByText(/first name/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/date of birth/i)).toBeVisible();
    await expect(page.getByText(/crn/i)).toBeVisible();
    await expect(page.getByText(/relationship/i)).toBeVisible();
  });

  test("children list v2 renders KidPill cards", async ({ page }) => {
    await page.goto("/parent/children?v2=1");
    await expect(page.getByText(/your children/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("E2EChild", { exact: false })).toBeVisible();
  });

});

test.describe("Parent Portal v2 — engagement API (authenticated)", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test("timeline GET includes like/comment counts + likedByMe", async ({ request }) => {
    const res = await request.get("/api/parent/timeline");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    for (const item of body.items) {
      expect(item).toHaveProperty("likeCount");
      expect(item).toHaveProperty("commentCount");
      expect(item).toHaveProperty("likedByMe");
    }
  });
});

test.describe("Parent Portal v2 — enrolment-driven account creation", () => {
  test("resend-invite endpoint rejects unauthenticated calls", async ({ request }) => {
    // No session — should 401
    const res = await request.post(
      "/api/centre-contacts/cc-fake/resend-invite",
    );
    expect([401, 403]).toContain(res.status());
  });
});
