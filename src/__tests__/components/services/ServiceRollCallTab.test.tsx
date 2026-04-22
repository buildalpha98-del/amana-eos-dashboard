// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub the roll-call data hook so we never hit the network.
vi.mock("@/hooks/useRollCall", () => ({
  useRollCall: () => ({
    data: {
      records: [],
      summary: { total: 0, present: 0, absent: 0, notMarked: 0 },
    },
    isLoading: false,
    error: null,
  }),
  useUpdateRollCall: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Stub the new weekly grid hook so we don't need real session/data.
vi.mock("@/hooks/useWeeklyRollCall", () => ({
  useWeeklyRollCall: () => ({ data: undefined, isLoading: false, error: null }),
  useEnrollableChildren: () => ({ data: undefined, isLoading: false, error: null }),
}));

// Session stub — required by the weekly grid's useSession().
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

// next/navigation mocks — `searchParamsRef.value` is mutated between tests to
// simulate different URL states.
const searchParamsRef: { value: URLSearchParams } = {
  value: new URLSearchParams(),
};
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.value,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

import { ServiceRollCallTab } from "@/components/services/ServiceRollCallTab";

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

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceRollCallTab — view toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.value = new URLSearchParams();
    routerReplace.mockClear();
  });

  it("renders daily view by default when no ?rollCallView param is set", () => {
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Daily view content — the date picker + session buttons are daily-only markup.
    // "Total Enrolled" summary card is part of the daily view.
    expect(screen.getByText(/Total Enrolled/i)).toBeDefined();

    // Weekly / monthly placeholders should NOT be visible.
    expect(screen.queryByText(/Weekly view — ships/i)).toBeNull();
    expect(screen.queryByText(/Monthly view — ships/i)).toBeNull();
  });

  it("renders weekly grid when ?rollCallView=weekly", () => {
    searchParamsRef.value = new URLSearchParams("rollCallView=weekly");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Weekly grid renders its week-range label (Week of ...).
    expect(screen.getByTestId("weekly-range-label").textContent).toMatch(/week of/i);
    // Daily markup should not be visible — the summary cards are daily-only.
    expect(screen.queryByText(/Total Enrolled/i)).toBeNull();
  });

  it("renders monthly placeholder when ?rollCallView=monthly", () => {
    searchParamsRef.value = new URLSearchParams("rollCallView=monthly");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByText(/Monthly view — ships/i)).toBeDefined();
    expect(screen.queryByText(/Total Enrolled/i)).toBeNull();
  });

  it("clicking the Weekly button calls router.replace with ?rollCallView=weekly", () => {
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const weeklyBtn = screen.getByRole("button", { name: /^weekly$/i });
    fireEvent.click(weeklyBtn);

    expect(routerReplace).toHaveBeenCalledTimes(1);
    const [url] = routerReplace.mock.calls[0];
    expect(url).toContain("rollCallView=weekly");
  });

  it("clicking the Monthly button preserves existing URL params", () => {
    searchParamsRef.value = new URLSearchParams("tab=roll-call&sub=today");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const monthlyBtn = screen.getByRole("button", { name: /^monthly$/i });
    fireEvent.click(monthlyBtn);

    expect(routerReplace).toHaveBeenCalledTimes(1);
    const [url] = routerReplace.mock.calls[0];
    expect(url).toContain("rollCallView=monthly");
    // Existing params retained.
    expect(url).toContain("tab=roll-call");
    expect(url).toContain("sub=today");
  });

  it("falls back to daily when rollCallView is a garbage value", () => {
    searchParamsRef.value = new URLSearchParams("rollCallView=foo");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Daily view content should render — not a blank page, not the placeholders.
    expect(screen.getByText(/Total Enrolled/i)).toBeDefined();
    expect(screen.queryByText(/Weekly view — ships/i)).toBeNull();
    expect(screen.queryByText(/Monthly view — ships/i)).toBeNull();
  });
});
