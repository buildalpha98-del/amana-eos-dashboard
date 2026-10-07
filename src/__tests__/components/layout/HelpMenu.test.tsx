// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const session = { data: { user: { role: "staff" } } };
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { HelpMenu } from "@/components/layout/HelpMenu";

describe("HelpMenu", () => {
  beforeEach(() => {
    session.data.user.role = "staff";
  });

  it("is a visible button, not just a keyboard shortcut", () => {
    render(<HelpMenu compact />);
    expect(screen.getByRole("button", { name: "Help" })).toBeTruthy();
  });

  it("opens the AI assistant through a window event", () => {
    const heard = vi.fn();
    window.addEventListener("amana:open-assistant", heard);
    render(<HelpMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ask amana ai/i }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    window.removeEventListener("amana:open-assistant", heard);
  });

  it("points staff at the Staff Handbook and hides keyboard shortcuts", () => {
    render(<HelpMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: /staff handbook/i }).getAttribute("href")).toBe("/tools/handbook");
    expect(screen.queryByRole("menuitem", { name: /keyboard shortcuts/i })).toBeNull();
  });

  it("gives office roles the guides hub and shortcuts", () => {
    session.data.user.role = "admin";
    render(<HelpMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: /how-to guides/i }).getAttribute("href")).toBe("/handbook?tab=help");
    expect(screen.getByRole("menuitem", { name: /keyboard shortcuts/i })).toBeTruthy();
  });
});
