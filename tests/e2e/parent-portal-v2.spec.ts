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
 * Current parent journey: Amana home, centre information, account and support.
 * Daily care and child-profile management remain in OWNA while the portal is
 * locked. Retain coverage of that boundary rather than asserting retired UI.
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

test.describe("Parent portal — authenticated", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test("home renders the Amana welcome and OWNA handoff", async ({ page }) => {
    await page.goto("/parent");
    // The branded welcome and enrolment section must load for this family.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    // Amana provides school information while daily care remains with OWNA.
    await expect(
      page.getByRole("heading", { name: "Your enrolment", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("One place for information. OWNA for daily care.")).toBeVisible();
    const school = page.locator(`a[href="/parent/my-centre?centre=${seeded.serviceId}"]`);
    await expect(school).toBeVisible();
    await school.click();
    await expect(page).toHaveURL(new RegExp(`/parent/my-centre\\?centre=${seeded.serviceId}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("child detail explains the OWNA boundary", async ({ page }) => {
    await page.goto(`/parent/children/${seeded.childId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: "Bookings and fees with OWNA" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get help with OWNA access" })).toHaveAttribute("href", "/parent/messages");
    await expect(page.getByText(/medical conditions/i)).toHaveCount(0);
  });

  test("messages list renders", async ({ page }) => {
    await page.goto("/parent/messages");
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
    await page.goto("/parent/account");
    await expect(page.getByText(/first name/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/date of birth/i)).toBeVisible();
    await expect(page.getByText(/crn/i)).toBeVisible();
    await expect(page.getByText(/relationship/i)).toBeVisible();
  });

  test("children list directs families to OWNA", async ({ page }) => {
    await page.goto("/parent/children");
    await expect(page.getByRole("heading", { name: "Bookings and fees with OWNA" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to your Amana home" })).toHaveAttribute("href", "/parent");
  });

});

test.describe("Parent portal — engagement API (authenticated)", () => {
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

test.describe("Parent portal — enrolment-driven account creation", () => {
  test("resend-invite endpoint rejects unauthenticated calls", async ({ request }) => {
    // No session — should 401
    const res = await request.post(
      "/api/centre-contacts/cc-fake/resend-invite",
    );
    expect([401, 403]).toContain(res.status());
  });
});
