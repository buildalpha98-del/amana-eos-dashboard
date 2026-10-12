/** @vitest-environment jsdom */
/**
 * ParentShell while the family app is closed: which page a family may see
 * depends on their enrolment state, so until it loads they see a spinner,
 * and if it can't load they see a retry card — never the portal shell.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = vi.hoisted(() => ({ path: "/parent/my-centre", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (p: Record<string, unknown>) => <img alt={String(p.alt ?? "")} src={String(p.src ?? "")} />,
}));
vi.mock("@/components/parent/ParentAuthProvider", () => ({
  ParentAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useParentAuth: () => ({ isAuthenticated: true, isLoading: false, logout: vi.fn() }),
}));
const conversations = vi.hoisted(() => vi.fn(() => ({ data: [] })));
vi.mock("@/hooks/useParentPortal", () => ({ useParentConversations: conversations }));
vi.mock("@/components/parent/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/lib/push/register", () => ({ registerParentServiceWorker: () => Promise.resolve() }));
const fetchApi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetch-api", () => ({ fetchApi }));

import { ParentShell } from "@/app/parent/ParentShell";

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ParentShell>
        <p>PAGE CONTENT</p>
      </ParentShell>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  nav.path = "/parent/my-centre";
});

describe("ParentShell while the family app is closed", () => {
  it("shows a spinner, not the portal, while the family's state loads", () => {
    fetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    renderShell();
    expect(screen.queryByText("PAGE CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("My Centre")).not.toBeInTheDocument();
  });

  it("shows a retry card — never the portal — when the state can't load", async () => {
    fetchApi.mockRejectedValue(new Error("network down"));
    renderShell();
    expect(await screen.findByText(/couldn.t load your account/i)).toBeInTheDocument();
    expect(screen.queryByText("PAGE CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("My Centre")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    fetchApi.mockResolvedValue({ state: "pending_review" });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/parent/enrol/thank-you"));
  });

  it("sends a submitted family from an app page to the thank-you page", async () => {
    fetchApi.mockResolvedValue({ state: "pending_review" });
    renderShell();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/parent/enrol/thank-you"));
    expect(screen.queryByText("PAGE CONTENT")).not.toBeInTheDocument();
  });

  it("shows the thank-you page itself to a confirmed family", async () => {
    nav.path = "/parent/enrol/thank-you";
    fetchApi.mockResolvedValue({ state: "active" });
    renderShell();
    expect(await screen.findByText("PAGE CONTENT")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends a family that hasn't enrolled to the form", async () => {
    fetchApi.mockResolvedValue({ state: "needs_enrolment" });
    renderShell();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/parent/enrol"));
  });

  it("never asks for messages while the app is closed", () => {
    fetchApi.mockResolvedValue({ state: "pending_review" });
    renderShell();
    expect(conversations).toHaveBeenCalledWith(false);
  });
});
