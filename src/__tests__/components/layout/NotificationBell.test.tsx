// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Silence toast side-effects & next router used by Popover
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { NotificationBell } from "@/components/layout/NotificationBell";

function mockFetchCount(count: number) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/notifications/unread-count")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
        json: async () => ({ count }),
      });
    }
    // Popover queries /api/notifications when it opens; return empty by default.
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
      json: async () => ({ notifications: [] }),
    });
  }) as unknown as typeof fetch;
}

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the bell trigger button", async () => {
    mockFetchCount(0);
    renderBell();
    const btn = await screen.findByRole("button", { name: /notifications/i });
    expect(btn).toBeTruthy();
  });

  it("hides the badge when unread count is 0", async () => {
    mockFetchCount(0);
    const { container } = renderBell();
    // Give the query a tick to resolve
    await waitFor(() => {
      expect(container.querySelector('[data-testid="notification-badge"]')).toBeNull();
    });
  });

  it("shows the unread count when > 0", async () => {
    mockFetchCount(3);
    renderBell();
    const badge = await screen.findByTestId("notification-badge");
    expect(badge.textContent).toBe("3");
  });

  it('shows "9+" when unread count exceeds 9', async () => {
    mockFetchCount(42);
    renderBell();
    const badge = await screen.findByTestId("notification-badge");
    expect(badge.textContent).toBe("9+");
  });
});
