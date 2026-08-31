// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Stub the monthly-view hook so we don't hit the network.
vi.mock("@/hooks/useMonthlyRollCall", () => ({
  useMonthlyRollCall: () => ({ data: undefined, isLoading: false, error: null }),
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

/**
 * The centre's rooms.
 *
 * Stage 2 of docs/rooms-migration-plan.md: the session tab row is built
 * from room RECORDS now, not a literal ["bsc","asc","vc"]. Seeded into
 * the query cache rather than mocked through fetchApi so the assertions
 * below stay synchronous.
 */
const ROOM_RECORDS = [
  { legacyKey: "bsc", name: "Rise and Shine" },
  { legacyKey: "asc", name: "Amana Afternoons" },
  { legacyKey: "vc", name: "Holiday Quest" },
].map((r, i) => ({
  id: `room-${r.legacyKey}`,
  startTime: null,
  endTime: null,
  capacity: null,
  ratio: null,
  description: null,
  minAgeYears: null,
  maxAgeYears: null,
  photoUrl: null,
  staffOnly: false,
  archivedAt: null,
  fees: [],
  archivedFees: [],
  sortOrder: i,
  ...r,
}));

function makeClient(rooms: Array<Record<string, unknown>> = ROOM_RECORDS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  qc.setQueryData(["service-rooms", "svc-1", "active"], { rooms });
  return qc;
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

  it("renders monthly calendar when ?rollCallView=monthly", () => {
    searchParamsRef.value = new URLSearchParams("rollCallView=monthly");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Monthly view renders its own range label.
    expect(screen.getByTestId("monthly-range-label")).toBeDefined();
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

  it("daily view reads ?date=YYYY-MM-DD from URL on mount", () => {
    searchParamsRef.value = new URLSearchParams(
      "rollCallView=daily&date=2026-04-15",
    );
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const dateInput = screen.getByDisplayValue("2026-04-15");
    expect(dateInput).toBeDefined();
    expect((dateInput as HTMLInputElement).value).toBe("2026-04-15");
  });

  it("daily view ignores malformed ?date and falls back to today", () => {
    searchParamsRef.value = new URLSearchParams(
      "rollCallView=daily&date=not-a-date",
    );
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // Should NOT have a 2026-04-15 value — should render a today fallback.
    expect(screen.queryByDisplayValue("not-a-date")).toBeNull();
    // Today's date string in YYYY-MM-DD (ISO) should appear in the date input.
    const today = new Date().toISOString().split("T")[0];
    expect(screen.getByDisplayValue(today)).toBeDefined();
  });

  it("daily view syncs URL when the user changes the date picker", async () => {
    searchParamsRef.value = new URLSearchParams("tab=roll-call&sub=today");
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // routerReplace may have been called already for the initial mount (no —
    // the didMountRef.current=true skip handles that). So clear and test
    // the user-driven change.
    routerReplace.mockClear();

    // Find the date input and change it. Use a date guaranteed to differ
    // from "today" in any timezone — 2025-01-01 is safe.
    const today = new Date().toISOString().split("T")[0];
    const dateInput = screen.getByDisplayValue(today) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-01" } });

    // useEffect fires after render; wait for the sync to happen.
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalled();
    });
    const [url] = routerReplace.mock.calls[0];
    expect(url).toContain("date=2025-01-01");
    // Preserves other URL params.
    expect(url).toContain("tab=roll-call");
    expect(url).toContain("sub=today");
  });
});

/**
 * Stage 2 of docs/rooms-migration-plan.md. The tab row was a literal
 * `["bsc","asc","vc"]` with a local `{bsc:"BSC"}` label map, so a centre
 * running a fourth room had no way to open its roll — even though the
 * write paths had been recording attendance against it since Stage 1.
 */
describe("ServiceRollCallTab — rooms as records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.value = new URLSearchParams();
    routerReplace.mockClear();
  });

  it("gives a room the enum called an extra its own tab", () => {
    const qc = makeClient([
      ...ROOM_RECORDS,
      { ...ROOM_RECORDS[0], id: "room-x", legacyKey: "extra1", name: "Homework Club" },
    ]);
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByRole("button", { name: "Homework Club" })).toBeDefined();
  });

  it("shows the room's own name, not the slot code", () => {
    // Staff say "Amana Afternoons". "ASC" is the filing code.
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByRole("button", { name: "Amana Afternoons" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "ASC" })).toBeNull();
  });

  it("opens on the afternoon programme, the session most centres run", () => {
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.getByRole("button", { name: "Amana Afternoons" }).className,
    ).toMatch(/bg-brand/);
  });

  it("falls back to the centre's first room when it has no afternoon session", () => {
    // Derived, not corrected in an effect — an effect would render one
    // frame asking the API for a room this centre doesn't have.
    const qc = makeClient([
      { ...ROOM_RECORDS[0], id: "room-only", legacyKey: "extra1", name: "Homework Club" },
    ]);
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.getByRole("button", { name: "Homework Club" }).className,
    ).toMatch(/bg-brand/);
  });

  it("switches rooms when a tab is pressed", () => {
    const qc = makeClient();
    render(<ServiceRollCallTab serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    fireEvent.click(screen.getByRole("button", { name: "Rise and Shine" }));
    expect(
      screen.getByRole("button", { name: "Rise and Shine" }).className,
    ).toMatch(/bg-brand/);
  });
});
