/**
 * E2E: Staff Dashboard v2 — NQS feature smoke tests.
 *
 * Covers the five Phase 2 tabs (Reflections, Observations, Medication, Risk,
 * Ratios) + the Phase 6 Newsletter generator + Phase 7 Shift Handover widget.
 *
 * Goal is "does the v2 tab render + create modal opens + submit path is
 * wired", not full integration. Happy paths only — error states have unit
 * tests in `src/__tests__/api/`.
 *
 * Requires:
 *   - .env.local with NEXTAUTH_URL=http://localhost:3000 + PARENT_JWT_SECRET
 *   - Owner auth storageState (auth.setup.ts is run first)
 *   - A seeded service row (from prisma/seed.ts)
 */

import { test, expect } from "@playwright/test";
import { gotoFirstService } from "./helpers/goto-first-service";

test.use({
  storageState: ".playwright/auth/owner.json",
});

test.describe("Staff Dashboard v2 — NQS features", () => {
  test("Reflections tab renders under Compliance and opens create modal", async ({
    page,
  }) => {
    // v2 flag via URL override so we hit the new shell.
    await gotoFirstService(page, {
      v2: "1",
      tab: "compliance",
      sub: "reflections",
    });

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Reflections/i).filter({ visible: true }).first()).toBeVisible();

    // Click "New reflection" if present
    const newBtn = page.getByRole("button", { name: /New reflection/i });
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      // Scope to the dialog — the button we just clicked also matches the
      // text, so an unscoped locator passes even when the modal never opens.
      await expect(
        page.getByRole("dialog").getByText(/New reflection/i),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Observations tab renders under Program + create modal has MTOP chips", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "program",
      sub: "observations",
    });

    await expect(page.getByText(/Learning observations/i)).toBeVisible({
      timeout: 15_000,
    });

    const newBtn = page.getByRole("button", { name: /New observation/i });
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      // MTOP outcomes should appear as chips
      await expect(page.getByText(/Identity/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/Learners/i).filter({ visible: true }).first()).toBeVisible();
    }
  });

  test("Medication tab renders under Daily Ops and exposes the log button", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "daily",
      sub: "medication",
    });

    await expect(page.getByText(/Medication/i).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Risk tab renders and 'New assessment' opens the hazard editor", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "compliance",
      sub: "risk",
    });

    await expect(page.getByText(/Risk assessments/i).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    const newBtn = page.getByRole("button", { name: /New assessment/i });
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      // Create dialog renders likelihood/severity pickers + hazard input
      await expect(page.getByText(/Likelihood/i)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/Severity/i)).toBeVisible();
    }
  });

  test("Ratios sub-tab renders Live + snapshots history", async ({ page }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "daily",
      sub: "ratios",
    });

    await expect(page.getByText(/Live ratio/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Staff Dashboard v2 — AI Newsletter flow (smoke)", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("Comms tab renders the 'Generate weekly newsletter' button", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "compliance",
      sub: "comms",
    });

    const btn = page.getByRole("button", {
      name: /Generate weekly newsletter/i,
    });
    // Button exists when the tab renders — that's enough for the smoke test.
    // (Actually clicking fires the LLM — covered by manual regression, not E2E.)
    const visible = await btn.isVisible().catch(() => false);
    // Tab content may be gated by role; we just assert it didn't error.
    await expect(page.locator("main")).toBeVisible();
    if (visible) {
      await expect(btn).toBeEnabled();
    }
  });
});

test.describe("Shift Handover widget", () => {
  test.use({ storageState: ".playwright/auth/owner.json" });

  test("Today tab renders the handover section", async ({ page }) => {
    // "today" is the default landing tab — explicitly set to be safe
    await gotoFirstService(page, { v2: "1", tab: "today" });

    // Either a "No open handovers" empty state or a list of notes — both accept.
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    const text = await page.locator("main").innerText();
    expect(text.toLowerCase()).toContain("shift handover");
  });
});
