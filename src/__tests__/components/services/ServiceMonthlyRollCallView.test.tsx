// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────

type MonthlyData = {
  month: string;
  days: Array<{ date: string; booked: number; attended: number; absent: number }>;
};

const monthlyRef: { data: MonthlyData | undefined } = { data: undefined };
const useMonthlyCalls: string[] = [];

vi.mock("@/hooks/useMonthlyRollCall", () => ({
  useMonthlyRollCall: (serviceId: string, month: string) => {
    useMonthlyCalls.push(`${serviceId}:${month}`);
    return {
      data: monthlyRef.data,
      isLoading: false,
      error: null,
    };
  },
}));

// next/navigation mocks
const searchParamsRef: { value: URLSearchParams } = {
  value: new URLSearchParams(),
};
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.value,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

import { ServiceMonthlyRollCallView } from "@/components/services/ServiceMonthlyRollCallView";

// ─── Helpers ─────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
}

function buildEmptyMonth(month: string): MonthlyData {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const days: MonthlyData["days"] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    days.push({
      date: cursor.toISOString().split("T")[0],
      booked: 0,
      attended: 0,
      absent: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { month, days };
}

function currentMonthStr(offset = 0): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceMonthlyRollCallView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.value = new URLSearchParams();
    routerReplace.mockClear();
    monthlyRef.data = undefined;
    useMonthlyCalls.length = 0;
  });

  it("requests the current month on mount", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    // Hook was called with this month
    expect(useMonthlyCalls).toContain(`svc-1:${currentMonthStr()}`);
  });

  it("renders a month label", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(screen.getByTestId("monthly-range-label")).toBeDefined();
  });

  it("renders 42 cells (6 rows × 7 cols)", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    // Grid must have exactly 42 direct children (6 weeks × 7 days).
    expect(grid.children.length).toBe(42);
    // Day cells use `monthly-cell-*`, padding cells use `monthly-pad-*`.
    const dayCells = within(grid).getAllByTestId(/^monthly-cell-/);
    const padCells = within(grid).getAllByTestId(/^monthly-pad-/);
    expect(dayCells.length + padCells.length).toBe(42);
  });

  it("renders day numbers 1..N for the current month", () => {
    // Use a known month — force 2026-04 via navigation once
    const month = currentMonthStr();
    monthlyRef.data = buildEmptyMonth(month);
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    // The last day of this month must be rendered.
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const grid = screen.getByTestId("monthly-grid");
    const dayCell = within(grid).getByTestId(
      `monthly-cell-${month}-${String(lastDay).padStart(2, "0")}`,
    );
    expect(dayCell).toBeDefined();
  });

  it("neutral color when booked=0", () => {
    const month = currentMonthStr();
    const data = buildEmptyMonth(month);
    // First day is already zeroed in the empty month — grab it
    const firstKey = data.days[0].date;
    monthlyRef.data = data;
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    const cell = within(grid).getByTestId(`monthly-cell-${firstKey}`);
    // Should NOT have green/yellow/red tint classes
    expect(cell.className).not.toMatch(/bg-green-100/);
    expect(cell.className).not.toMatch(/bg-yellow-100/);
    expect(cell.className).not.toMatch(/bg-red-100/);
  });

  it("green when attended/booked >= 0.9", () => {
    const month = currentMonthStr();
    const data = buildEmptyMonth(month);
    const target = data.days[0].date; // 1st of month
    data.days[0] = { date: target, booked: 10, attended: 10, absent: 0 };
    monthlyRef.data = data;
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    const cell = within(grid).getByTestId(`monthly-cell-${target}`);
    expect(cell.className).toMatch(/bg-green-100/);
  });

  it("amber when attended/booked >= 0.7 but < 0.9", () => {
    const month = currentMonthStr();
    const data = buildEmptyMonth(month);
    const target = data.days[0].date;
    data.days[0] = { date: target, booked: 10, attended: 7, absent: 3 };
    monthlyRef.data = data;
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    const cell = within(grid).getByTestId(`monthly-cell-${target}`);
    expect(cell.className).toMatch(/bg-yellow-100/);
  });

  it("red when attended/booked < 0.7", () => {
    const month = currentMonthStr();
    const data = buildEmptyMonth(month);
    const target = data.days[0].date;
    data.days[0] = { date: target, booked: 10, attended: 5, absent: 5 };
    monthlyRef.data = data;
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    const cell = within(grid).getByTestId(`monthly-cell-${target}`);
    expect(cell.className).toMatch(/bg-red-100/);
  });

  it("clicking a day calls router.replace with rollCallView=daily and date=YYYY-MM-DD preserving tab/sub", () => {
    searchParamsRef.value = new URLSearchParams("tab=roll-call&sub=today");
    const month = currentMonthStr();
    const data = buildEmptyMonth(month);
    const target = data.days[0].date;
    data.days[0] = { date: target, booked: 10, attended: 10, absent: 0 };
    monthlyRef.data = data;

    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    const cell = within(grid).getByTestId(`monthly-cell-${target}`);
    fireEvent.click(cell);

    expect(routerReplace).toHaveBeenCalledTimes(1);
    const [url] = routerReplace.mock.calls[0];
    expect(url).toContain("rollCallView=daily");
    expect(url).toContain(`date=${target}`);
    expect(url).toContain("tab=roll-call");
    expect(url).toContain("sub=today");
  });

  it("clicking next button switches to next month", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    // Reset so we only measure the NEXT call
    useMonthlyCalls.length = 0;

    const nextBtn = screen.getByRole("button", { name: /next month/i });
    fireEvent.click(nextBtn);

    // Next call should include offset=+1 month
    expect(useMonthlyCalls).toContain(`svc-1:${currentMonthStr(1)}`);
  });

  it("clicking prev button switches to previous month", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    useMonthlyCalls.length = 0;

    const prevBtn = screen.getByRole("button", { name: /previous month/i });
    fireEvent.click(prevBtn);

    expect(useMonthlyCalls).toContain(`svc-1:${currentMonthStr(-1)}`);
  });

  it("UTC-safe: Monday-start week layout — first cell is Mon", () => {
    monthlyRef.data = buildEmptyMonth(currentMonthStr());
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const headers = screen.getAllByTestId(/monthly-header-/);
    // Mon first
    expect(headers[0].getAttribute("data-testid")).toBe("monthly-header-mon");
    expect(headers[6].getAttribute("data-testid")).toBe("monthly-header-sun");
  });

  it("April 2026 shows April 1 (not March 31) — UTC-safe boundary", () => {
    // Force April 2026 via a monthOffset derived from 'now' is hard, so
    // instead we verify the specific cell for 2026-04-01 renders when the
    // data provider returns April 2026. This locks down the day-key format.
    const month = "2026-04";
    const data = buildEmptyMonth(month);
    monthlyRef.data = data;
    // Re-use current month rendering: the component builds its cells from
    // `data.days`, so as long as 2026-04-01 is in the day map, it must render.
    const qc = makeClient();
    render(<ServiceMonthlyRollCallView serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    const grid = screen.getByTestId("monthly-grid");
    expect(within(grid).getByTestId("monthly-cell-2026-04-01")).toBeDefined();
    // And a March 31 cell (padding) should exist — but NOT as a day cell for
    // THIS month; padding cells use a different testid.
    expect(within(grid).queryByTestId("monthly-cell-2026-03-31")).toBeNull();
  });
});
