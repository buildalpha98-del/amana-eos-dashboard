// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MyLeaveBalanceCard } from "@/components/my-portal/MyLeaveBalanceCard";

function mockFetchBalances(
  balances: Array<Record<string, unknown>>,
  opts: { ok?: boolean } = {},
) {
  const ok = opts.ok !== false;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/leave/balances")) {
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        headers: {
          get: (h: string) => (h === "content-type" ? "application/json" : null),
        },
        json: async () => (ok ? balances : { error: "Server error" }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
    });
  }) as unknown as typeof fetch;
}

function renderCard(userId = "user-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyLeaveBalanceCard userId={userId} />
    </QueryClientProvider>,
  );
}

describe("MyLeaveBalanceCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the card heading", async () => {
    mockFetchBalances([]);
    renderCard();
    expect(await screen.findByText(/My Leave Balance/i)).toBeTruthy();
  });

  it("shows empty state when no balances exist", async () => {
    mockFetchBalances([]);
    const { container } = renderCard();
    await waitFor(() => {
      expect(container.textContent).toMatch(/No leave balances on file/i);
    });
  });

  it("renders the annual leave balance numbers when present", async () => {
    mockFetchBalances([
      {
        id: "lb-1",
        userId: "user-1",
        leaveType: "annual",
        balance: 15,
        accrued: 20,
        taken: 5,
        pending: 0,
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      // accrued 20, taken 5, remaining 15 — all should appear
      expect(container.textContent).toContain("20");
      expect(container.textContent).toContain("5");
      expect(container.textContent).toContain("15");
    });
    expect(container.textContent).toMatch(/annual/i);
  });

  it("renders both annual and personal when both present", async () => {
    mockFetchBalances([
      {
        id: "lb-1",
        userId: "user-1",
        leaveType: "annual",
        balance: 12,
        accrued: 18,
        taken: 6,
        pending: 0,
      },
      {
        id: "lb-2",
        userId: "user-1",
        leaveType: "personal",
        balance: 7,
        accrued: 10,
        taken: 3,
        pending: 0,
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      expect(container.textContent).toMatch(/annual/i);
      expect(container.textContent).toMatch(/personal/i);
    });
  });

  it("does not render annual card when only personal is returned", async () => {
    mockFetchBalances([
      {
        id: "lb-2",
        userId: "user-1",
        leaveType: "personal",
        balance: 4,
        accrued: 10,
        taken: 6,
        pending: 0,
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      expect(container.textContent).toMatch(/personal/i);
    });
    expect(container.textContent).not.toMatch(/annual leave/i);
  });
});
