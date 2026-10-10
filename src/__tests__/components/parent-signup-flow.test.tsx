// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { mutateApi } from "@/lib/fetch-api";
import ParentSignupPage from "@/app/parent/signup/page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/analytics/MetaPixel", () => ({ MetaPixel: () => null }));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: vi.fn(), fetchApi: vi.fn() }));
const mutate = vi.mocked(mutateApi);
const password = "Synthetic-test-password-2026";
function fillValidForm() {
  for (const [label, value] of [
    ["Full name", "Preview Parent"],
    ["Email address", "preview@example.invalid"],
    ["Password", password],
    ["Confirm password", password],
  ]) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Parent signup journey", () => {
  it("blocks mismatched passwords before sending a request", () => {
    render(<ParentSignupPage />);
    fillValidForm();
    fireEvent.change(
      screen.getByLabelText("Confirm password", { exact: true }),
      { target: { value: "mismatched-password" } },
    );
    expect(screen.getByText("Passwords don't match.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create account & continue" }),
    ).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });
  it("keeps submission disabled while waiting and continues to family details after success", async () => {
    let finish!: (value: { redirectTo: string }) => void;
    mutate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<ParentSignupPage />);
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & continue" }),
    );
    expect(
      screen.getByRole("button", { name: "Create account & continue" }),
    ).toBeDisabled();
    expect(mutate).toHaveBeenCalledWith(
      "/api/parent/auth/signup",
      expect.objectContaining({
        method: "POST",
        body: {
          fullName: "Preview Parent",
          email: "preview@example.invalid",
          password,
        },
      }),
    );
    finish({ redirectTo: "/parent/enrol" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/parent/enrol"));
  });
  it("announces server errors, preserves entered details and permits retry", async () => {
    mutate.mockRejectedValueOnce(
      new Error("You already have an account. Please sign in."),
    );
    render(<ParentSignupPage />);
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & continue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please sign in.",
    );
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "preview@example.invalid",
    );
    expect(
      screen.getByRole("button", { name: "Create account & continue" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: /^Sign in$/ }),
    ).toHaveAttribute("href", "/parent/login");
    expect(replace).not.toHaveBeenCalled();
  });
});
