// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Load-bearing memoization test for ServiceWeeklyRollCallGrid.
 *
 * The grid renders up to ~300 WeeklyRollCallCell instances (20 children × 5 days
 * × ~3 session types). Each cell is wrapped in React.memo with a custom
 * comparator that includes `onClickShift` / `onClickEmpty` identity.
 *
 * If the grid passes inline-wrapped callbacks (`(s) => onClickShift(childId, ...)`)
 * through `WeeklyGridTable` to each cell, the comparator sees new fn refs on
 * every parent re-render — all cells re-render every tick, defeating memoization.
 *
 * To detect this we mock `WeeklyGridTable` as a capture layer: we record the
 * onClick callbacks the grid threads into it, trigger a benign parent re-render,
 * and assert the callback identities are preserved across renders.
 */

// ─── Session mock ────────────────────────────────────────────────
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-self",
        email: "me@example.com",
        role: "admin",
        serviceId: null,
      },
    },
    status: "authenticated",
  }),
}));

// ─── Toast + fetch mocks (no-ops) ────────────────────────────────
vi.mock("@/hooks/useToast", () => ({
  toast: () => {},
  useToast: () => ({ toast: () => {}, toasts: [], dismiss: () => {} }),
}));

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: () => Promise.resolve({}),
  mutateApi: () => Promise.resolve({}),
  ApiResponseError: class ApiResponseError extends Error {},
}));

// ─── Data-layer mock ────────────────────────────────────────────
const monday = (function mondayIso() {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
})();

const weeklyData = {
  children: [
    {
      id: "child-1",
      firstName: "Ava",
      surname: "Nguyen",
      photo: null,
      dob: null,
      bookingPrefs: null,
    },
  ],
  attendanceRecords: [],
  bookings: [
    {
      id: "booking-1",
      childId: "child-1",
      date: `${monday}T00:00:00.000Z`,
      sessionType: "asc" as const,
      fee: null,
    },
  ],
  weekStart: monday,
};

vi.mock("@/hooks/useWeeklyRollCall", () => ({
  useWeeklyRollCall: () => ({ data: weeklyData, isLoading: false, error: null }),
  useEnrollableChildren: () => ({ data: undefined, isLoading: false, error: null }),
}));

// ─── Capture layer: mock WeeklyGridTable ─────────────────────────
const captured: {
  onClickShift: Array<unknown>;
  onClickEmpty: Array<unknown>;
} = { onClickShift: [], onClickEmpty: [] };

vi.mock("@/components/services/weekly-grid/WeeklyGridTable", () => ({
  WeeklyGridTable: (props: {
    onClickShift: (...args: unknown[]) => void;
    onClickEmpty: (...args: unknown[]) => void;
  }) => {
    captured.onClickShift.push(props.onClickShift);
    captured.onClickEmpty.push(props.onClickEmpty);
    return <div data-testid="mock-grid-table" />;
  },
}));

import { ServiceWeeklyRollCallGrid } from "@/components/services/ServiceWeeklyRollCallGrid";

// ─── Helpers ────────────────────────────────────────────────────
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ─── Test ────────────────────────────────────────────────────────
describe("ServiceWeeklyRollCallGrid — memoization", () => {
  beforeEach(() => {
    captured.onClickShift.length = 0;
    captured.onClickEmpty.length = 0;
  });

  it("passes reference-stable onClickShift/onClickEmpty across parent re-renders", () => {
    const qc = makeClient();
    const { rerender } = render(
      <ServiceWeeklyRollCallGrid serviceId="svc-1" />,
      { wrapper: makeWrapper(qc) },
    );

    // Sanity: first pass captured.
    expect(captured.onClickShift.length).toBeGreaterThanOrEqual(1);
    const initialOnClickShift = captured.onClickShift[0];
    const initialOnClickEmpty = captured.onClickEmpty[0];

    // Force an unrelated parent re-render (same props).
    rerender(<ServiceWeeklyRollCallGrid serviceId="svc-1" />);

    const afterOnClickShift =
      captured.onClickShift[captured.onClickShift.length - 1];
    const afterOnClickEmpty =
      captured.onClickEmpty[captured.onClickEmpty.length - 1];

    // Identity MUST be preserved — if inline wrappers were reintroduced,
    // a new fn ref would be created each render and this would fail.
    expect(afterOnClickShift).toBe(initialOnClickShift);
    expect(afterOnClickEmpty).toBe(initialOnClickEmpty);
  });

  it("identities remain stable when week-offset changes and returns to 0", () => {
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const initialOnClickShift = captured.onClickShift[0];
    const initialOnClickEmpty = captured.onClickEmpty[0];

    // Navigate forward then back. Our mocked useWeeklyRollCall returns the
    // same `weeklyData` object ref regardless of weekStart, so the
    // childNameById dep stays stable and handleClickShift/Empty should not
    // be re-created.
    fireEvent.click(screen.getByRole("button", { name: /next week/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous week/i }));

    const afterOnClickShift =
      captured.onClickShift[captured.onClickShift.length - 1];
    const afterOnClickEmpty =
      captured.onClickEmpty[captured.onClickEmpty.length - 1];

    expect(afterOnClickShift).toBe(initialOnClickShift);
    expect(afterOnClickEmpty).toBe(initialOnClickEmpty);
  });
});
