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
 * End-to-end coverage for the v2 redesign flows. These specs set
 * NEXT_PUBLIC_PARENT_PORTAL_V2 to "true" through the URL override (?v2=1)
 * so they work against any env regardless of the env var state.
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

  test("home v2 renders greeting + quick actions", async ({ page }) => {
    await page.goto("/parent?v2=1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // Quick Actions section label
    await expect(page.getByText(/quick actions/i)).toBeVisible();
    // Book a casual CTA (if the account has kids)
    await expect(page.getByText(/book a casual/i)).toBeVisible();
  });

  test("child detail v2 shows hero + 14-day strip", async ({ page }) => {
    await page.goto(`/parent/children/${seeded.childId}?v2=1`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // Last 14 days section label
    await expect(page.getByText(/last 14 days/i)).toBeVisible();
    // Sticky action bar
    await expect(page.getByRole("link", { name: /message/i })).toBeVisible();
  });

  test("bookings v2 shows segmented control + FAB", async ({ page }) => {
    await page.goto("/parent/bookings?v2=1");
    await expect(
      page.getByRole("button", { name: /upcoming/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /book/i }).last(),
    ).toBeVisible();
  });

  test("bookings fast-book sheet opens from FAB", async ({ page }) => {
    await page.goto("/parent/bookings?v2=1");
    const fab = page.getByRole("button", { name: /^book$/i });
    await fab.click();
    // Sheet should show step 1 (pick child) or step 2 (single kid auto-advance)
    await expect(page.getByText(/book a casual/i)).toBeVisible({ timeout: 5_000 });
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

  test("getting-started v2 shows progress + checklist", async ({ page }) => {
    await page.goto("/parent/getting-started?v2=1");
    await expect(page.getByText(/get set up/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/complete your profile/i)).toBeVisible();
  });

  test("v1/v2 switcher respects query override", async ({ page }) => {
    // Force v1
    await page.goto("/parent/bookings?v2=0");
    // V1 has its own headings — confirm we got a response without errors
    await expect(page.getByText(/something went wrong|500/i)).toHaveCount(0);
    // Now flip to v2 — the segmented control is unique to v2
    await page.goto("/parent/bookings?v2=1");
    await expect(
      page.getByRole("button", { name: /upcoming/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
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
