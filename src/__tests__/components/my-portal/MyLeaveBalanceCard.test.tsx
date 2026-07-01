// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MyLeaveBalanceCard } from "@/components/my-portal/MyLeaveBalanceCard";

// Component fetches /api/my-portal/leave/balances via fetchApi (which checks
// content-type). Mock returns the EH payroll shape: { balances: LeaveBalance[] }.
function mockFetchBalances(
  balances: Array<Record<string, unknown>>,
  opts: { ok?: boolean } = {},
) {
  const ok = opts.ok !== false;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/my-portal/leave/balances")) {
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        headers: {
          get: (h: string) => (h === "content-type" ? "application/json" : null),
        },
        json: async () => (ok ? { balances } : { error: "Server error" }),
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

  it("renders the leave balance when present (EH payroll format)", async () => {
    mockFetchBalances([
      {
        leaveCategoryId: 1,
        leaveCategoryName: "Annual Leave",
        accruedAmount: 15.5,
        unitType: "Hours",
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      expect(container.textContent).toContain("Annual Leave");
      expect(container.textContent).toContain("15.50 hours");
    });
  });

  it("renders both leave categories when both present", async () => {
    mockFetchBalances([
      {
        leaveCategoryId: 1,
        leaveCategoryName: "Annual Leave",
        accruedAmount: 40.0,
        unitType: "Hours",
      },
      {
        leaveCategoryId: 2,
        leaveCategoryName: "Personal/Carer's Leave",
        accruedAmount: 8.0,
        unitType: "Hours",
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      expect(container.textContent).toContain("Annual Leave");
      expect(container.textContent).toContain("Personal/Carer's Leave");
    });
  });

  it("does not show annual leave when only personal leave is returned", async () => {
    mockFetchBalances([
      {
        leaveCategoryId: 2,
        leaveCategoryName: "Personal/Carer's Leave",
        accruedAmount: 4.0,
        unitType: "Hours",
      },
    ]);
    const { container } = renderCard("user-1");

    await waitFor(() => {
      expect(container.textContent).toContain("Personal/Carer's Leave");
    });
    expect(container.textContent).not.toContain("Annual Leave");
  });
});
