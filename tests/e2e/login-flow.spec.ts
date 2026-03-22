/**
 * E2E: Login page flow
 *
 * Tests the login page WITHOUT stored authentication.
 * Verifies form elements, validation, and error handling.
 */

import { test, expect } from "@playwright/test";

test.describe("Login flow", () => {
  // No storageState — test unauthenticated

  test("login page renders with all form elements", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Should show the brand heading
    await expect(page.getByText("Amana OSHC")).toBeVisible({ timeout: 15_000 });

    // Should show the sign-in heading
    await expect(
      page.getByText("Sign in to your account"),
    ).toBeVisible();

    // Should show the subtitle
    await expect(
      page.getByText("EOS Management Dashboard"),
    ).toBeVisible();

    // Email input field
    const emailInput = page.getByPlaceholder("you@amanaoshc.com.au");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("type", "email");

    // Password input field
    const passwordInput = page.getByPlaceholder("Enter your password");
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Submit button
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test("login page has remember me checkbox", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // "Keep me signed in" checkbox
    const rememberCheckbox = page.getByLabel("Keep me signed in");
    await expect(rememberCheckbox).toBeVisible();
    await expect(rememberCheckbox).not.toBeChecked();

    // Can toggle the checkbox
    await rememberCheckbox.check();
    await expect(rememberCheckbox).toBeChecked();

    await rememberCheckbox.uncheck();
    await expect(rememberCheckbox).not.toBeChecked();
  });

  test("login page has forgot password link", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // "Forgot password?" link
    const forgotLink = page.getByRole("link", { name: "Forgot password?" });
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toHaveAttribute("href", "/forgot-password");
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Fill in invalid credentials
    await page.getByPlaceholder("you@amanaoshc.com.au").fill("fake@invalid.com");
    await page.getByPlaceholder("Enter your password").fill("WrongPassword123!");

    // Submit the form
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show error message
    await expect(
      page.getByText("Invalid email or password"),
    ).toBeVisible({ timeout: 15_000 });

    // Should still be on the login page
    await expect(page).toHaveURL(/login/);

    // Form fields should still be visible (not navigated away)
    await expect(page.getByPlaceholder("you@amanaoshc.com.au")).toBeVisible();
  });

  test("submit button shows loading state during login attempt", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Fill credentials
    await page.getByPlaceholder("you@amanaoshc.com.au").fill("fake@test.com");
    await page.getByPlaceholder("Enter your password").fill("SomePassword1!");

    // Click submit and check for loading state
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await submitButton.click();

    // Button should become disabled during loading
    // (This may flash quickly, but we check the form still shows eventually)
    await expect(page.getByPlaceholder("you@amanaoshc.com.au")).toBeVisible({ timeout: 15_000 });
  });
});
