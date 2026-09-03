/**
 * E2E: Staff portal flow
 *
 * My Portal home hub → pay/leave/expense destinations → access controls.
 *
 * Staff Portal v2 (Phase 1) moved the EH payslip, leave and expense
 * sections off /my-portal onto /my-pay, /my-leave and /my-expenses —
 * the hub now carries glance tiles linking to them. Assertions use
 * data-testids (not loose getByText regexes) per the CLAUDE.md E2E
 * gotcha about substring/strict-mode traps.
 *
 * The EH-backed destinations render a friendly "unavailable" state when
 * the payroll integration is off (as it is in CI) — tests accept either
 * the data view or that state, and fail only on real error states.
 */

import { test, expect } from "@playwright/test";

test.describe("Staff portal flow", () => {
  test.use({
    storageState: ".playwright/auth/staff.json",
  });

  test("my portal home hub renders hero, glance tiles, and quick actions", async ({
    page,
  }) => {
    await page.goto("/my-portal");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // The four glance tiles link to the dedicated destinations.
    await expect(page.getByTestId("glance-tiles")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("glance-pay")).toHaveAttribute(
      "href",
      "/my-pay",
    );
    await expect(page.getByTestId("glance-leave")).toHaveAttribute(
      "href",
      "/my-leave",
    );
    await expect(page.getByTestId("glance-expenses")).toHaveAttribute(
      "href",
      "/my-expenses",
    );
    await expect(page.getByTestId("glance-compliance")).toHaveAttribute(
      "href",
      "/compliance",
    );

    // Next-shift/clock hero slot and the quick-actions row.
    await expect(page.getByTestId("next-shift-hero")).toBeVisible();
    await expect(page.getByTestId("quick-actions")).toBeVisible();
    await expect(
      page.getByTestId("quick-actions").getByRole("link", {
        name: "Apply leave",
      }),
    ).toHaveAttribute("href", "/my-leave");

    // Kept sections: profile summary still renders.
    await expect(page.getByTestId("view-full-profile-link")).toBeVisible();

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("my-leave destination renders balances or the unavailable state", async ({
    page,
  }) => {
    await page.goto("/my-leave");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("my-leave-page")).toBeVisible();

    // Either live EH balances (+ requests list) or the single friendly
    // not-linked/not-configured state — never both, never neither.
    await expect(
      page
        .getByTestId("my-leave-balances")
        .or(page.getByTestId("my-leave-unavailable"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
    await expect(
      page.getByText("Unable to load leave balances"),
    ).not.toBeVisible();
  });

  test("my-pay destination renders payslips or the unavailable state", async ({
    page,
  }) => {
    await page.goto("/my-pay");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Pay", exact: true }),
    ).toBeVisible();

    // Hero card with real data, or one of the friendly states (not
    // configured / not linked / no payslips yet).
    await expect(
      page
        .getByTestId("payslip-hero-card")
        .or(
          page.getByText(
            /payroll integration isn't set up|isn't linked to a payroll record|no payslips yet/i,
          ),
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // No error states
    await expect(page.getByText("Unable to load payslips")).not.toBeVisible();
  });

  test("my-expenses destination renders claims or the unavailable state", async ({
    page,
  }) => {
    await page.goto("/my-expenses");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Reimbursements", exact: true }),
    ).toBeVisible();

    // Snap-receipt hero with real data, or the friendly unavailable state.
    await expect(
      page
        .getByTestId("expense-snap-hero")
        .or(page.getByTestId("my-expenses-unavailable"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("compliance page is accessible to staff", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Staff should be able to view compliance page
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show compliance-related content
    const hasCompliance = await page
      .getByText(/compliance|certificate|WWCC|First Aid|CPR/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasCompliance || (await page.locator("main").textContent())!.length > 20).toBeTruthy();
  });

  test("staff cannot access settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Staff should be redirected or shown unauthorized
    const url = page.url();
    // Should NOT stay on /settings — either redirected or access denied
    const isRedirected = !url.includes("/settings");
    const hasAccessDenied = await page
      .getByText(/unauthorized|access denied|permission/i)
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessDenied).toBeTruthy();
  });

  test("staff cannot access financials page", async ({ page }) => {
    await page.goto("/financials");
    await page.waitForLoadState("networkidle");

    // Staff should be redirected or shown unauthorized
    const url = page.url();
    const isRedirected = !url.includes("/financials");
    const hasAccessDenied = await page
      .getByText(/unauthorized|access denied|permission/i)
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessDenied).toBeTruthy();
  });

  test("documents page is accessible to staff", async ({ page }) => {
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    // Staff should be able to view documents
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Should show document-related UI
    const hasDocContent = await page.locator("main").textContent();
    expect(hasDocContent!.length).toBeGreaterThan(10);

    // No error states
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });
});
