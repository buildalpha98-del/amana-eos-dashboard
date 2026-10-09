// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), getSession: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: mocks.signIn, getSession: mocks.getSession }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/layout/AuthBackdrop", () => ({ AuthBackdrop: ({ children }: { children: ReactNode }) => <div>{children}</div>, SunMark: () => null }));
import LoginPage from "@/app/(auth)/login/page";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { role: "owner" } });
});

describe("MFA login interaction", () => {
  it("prompts for the second factor and submits it before navigating", async () => {
    mocks.signIn.mockResolvedValueOnce({ error: "MFA_REQUIRED" }).mockResolvedValueOnce({ error: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const code = await screen.findByLabelText("Authenticator or backup code");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signIn).toHaveBeenLastCalledWith("credentials", expect.objectContaining({ email: "owner@example.test", password: "password", mfaCode: "123456" }));
  });
});
