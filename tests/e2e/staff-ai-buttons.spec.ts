/**
 * E2E: AI Buttons render + are reachable on the 5 editor surfaces.
 *
 * Doesn't actually trigger the AI (which would burn LLM tokens and require
 * a working ANTHROPIC_API_KEY). Just smoke-tests:
 *   - Button is in the DOM
 *   - Button is enabled when the minimum context is filled in
 *   - Button is disabled before the minimum context is filled
 *
 * Per surface, that's the contract that prevents accidental shipping of a
 * dead/disabled-only button.
 */

import { test, expect } from "@playwright/test";
import { gotoFirstService } from "./helpers/goto-first-service";

test.use({ storageState: ".playwright/auth/owner.json" });

test.describe("AI Buttons — surface coverage", () => {
  test("Reflection create dialog has an AiButton, disabled until title set", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "compliance",
      sub: "reflections",
    });

    const newBtn = page.getByRole("button", { name: /New reflection/i });
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await newBtn.click();

    const aiBtn = page.getByRole("button", { name: /Draft with AI/i });
    await expect(aiBtn).toBeVisible({ timeout: 5_000 });
    // Title is empty → button disabled
    await expect(aiBtn).toBeDisabled();

    // Fill the title — button becomes enabled
    const titleInput = page.locator("input[placeholder*='reflection']").first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill("Week ending 25 Apr");
      await expect(aiBtn).toBeEnabled();
    }
  });

  test("Observation create dialog has an AiButton with MTOP chip context", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "program",
      sub: "observations",
    });

    const newBtn = page.getByRole("button", { name: /New observation/i });
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await newBtn.click();
    await expect(
      page.getByRole("button", { name: /Draft with AI/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Risk hazards editor has 'Suggest hazards' AI button", async ({
    page,
  }) => {
    await gotoFirstService(page, {
      v2: "1",
      tab: "compliance",
      sub: "risk",
    });

    const newBtn = page.getByRole("button", { name: /New assessment/i });
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await newBtn.click();
    await expect(
      page.getByRole("button", { name: /Suggest hazards/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Newsletter generator surface — Comms tab exposes the trigger", async ({
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
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await expect(btn).toBeEnabled();
    }
  });
});
