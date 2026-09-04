// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────
// The `role` variable is mutated between tests to flip canEdit on/off.
const sessionRef: { role: string; serviceId: string | null } = {
  role: "admin",
  serviceId: null,
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-self",
        email: "me@example.com",
        role: sessionRef.role,
        serviceId: sessionRef.serviceId,
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import { ServiceWeeklyShiftsGrid } from "@/components/services/ServiceWeeklyShiftsGrid";
import { getWeekStart, toLocalIsoDate } from "@/lib/utils";

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

const TEAM_MEMBERS = [
  {
    id: "staff-1",
    name: "Jane Doe",
    email: "jane@example.com",
    role: "staff",
    avatar: null,
    service: { id: "svc-1", name: "Lakemba" },
    active: true,
    activeRocks: 0,
    totalTodos: 0,
    completedTodos: 0,
    todoCompletionPct: 0,
    openIssues: 0,
    managedServices: 0,
    rocks: [],
  },
  {
    id: "staff-2",
    name: "Bob Smith",
    email: "bob@example.com",
    role: "staff",
    avatar: null,
    service: { id: "svc-1", name: "Lakemba" },
    active: true,
    activeRocks: 0,
    totalTodos: 0,
    completedTodos: 0,
    todoCompletionPct: 0,
    openIssues: 0,
    managedServices: 0,
    rocks: [],
  },
];

const SHIFT_SAMPLE = {
  id: "shift-1",
  userId: "staff-1",
  staffName: "Jane Doe",
  // Using a fixed date in the current week for the test — don't assume which
  // day of the week the test runs on; the grid's internal weekStart is
  // derived from `new Date()` so we just make sure a shift lands inside.
  date: new Date().toISOString(),
  sessionType: "asc",
  shiftStart: "15:00",
  shiftEnd: "18:00",
  role: null,
  status: "draft" as const,
  user: { id: "staff-1", name: "Jane Doe", avatar: null },
};

// Monday of the CURRENT week as local YYYY-MM-DD — always inside the grid's
// default visible week, whatever day the test runs on.
const MONDAY_ISO = toLocalIsoDate(getWeekStart());

function installFetchMock(opts?: {
  withShift?: boolean;
  /** Overrides the shifts list entirely when provided. */
  shifts?: unknown[];
  /** dateString → sessionType → children[] for /api/bookings/roster. */
  bookingsRoster?: Record<string, Record<string, unknown[]>>;
}) {
  const capture: { calls: Array<{ url: string; init?: RequestInit }> } = {
    calls: [],
  };
  global.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    capture.calls.push({ url: u, init });

    if (u.includes("/api/team")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => TEAM_MEMBERS,
      } as unknown as Response;
    }

    if (u.includes("/api/bookings/roster")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => opts?.bookingsRoster ?? {},
      } as unknown as Response;
    }

    if (u.includes("/api/roster/shifts")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          shifts: opts?.shifts ?? (opts?.withShift ? [SHIFT_SAMPLE] : []),
        }),
      } as unknown as Response;
    }

    if (u.includes("/api/roster/publish")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ publishedCount: 2, notificationsSent: 1 }),
      } as unknown as Response;
    }

    if (u.includes("/api/roster/copy-week")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ created: 3, replaced: 1, skipped: [] }),
      } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return capture;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceWeeklyShiftsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
  });

  it("renders staff rows and editor controls for admin (canEdit=true)", async () => {
    sessionRef.role = "admin";
    installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
      expect(screen.getByText("Bob Smith")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /copy last week/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /publish/i })).toBeDefined();
  });

  it("hides editor controls for staff role (read-only)", async () => {
    sessionRef.role = "staff";
    installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /copy last week/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("coordinator of another service is read-only", async () => {
    sessionRef.role = "member";
    sessionRef.serviceId = "svc-other"; // NOT svc-1
    installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /copy last week/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("coordinator of own service sees editor controls", async () => {
    sessionRef.role = "member";
    sessionRef.serviceId = "svc-1";
    installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy last week/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /publish/i })).toBeDefined();
    });
  });

  it("clicking Publish posts to /api/roster/publish", async () => {
    sessionRef.role = "admin";
    const capture = installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => {
      const call = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/publish") &&
          (c.init?.method ?? "GET") === "POST",
      );
      expect(call).toBeDefined();
    });
  });

  it("clicking Copy last week posts to /api/roster/copy-week", async () => {
    sessionRef.role = "admin";
    const capture = installFetchMock();

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /copy last week/i }));

    await waitFor(() => {
      const call = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/copy-week") &&
          (c.init?.method ?? "GET") === "POST",
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call!.init!.body));
      expect(body.serviceId).toBe("svc-1");
      expect(body.targetWeekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.sourceWeekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("renders a pinned Open shifts row for null-userId shifts", async () => {
    sessionRef.role = "admin";
    installFetchMock({
      shifts: [
        SHIFT_SAMPLE,
        {
          ...SHIFT_SAMPLE,
          id: "shift-open-1",
          userId: null,
          user: null,
          staffName: "Open shift",
          // Local noon on Monday — lands on Monday's column in every TZ.
          date: `${MONDAY_ISO}T12:00:00`,
        },
      ],
    });

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Open shifts")).toBeDefined();
      expect(screen.getByText("Open shift")).toBeDefined();
    });
    // The pinned row exists and holds the unassigned chip.
    expect(screen.getByTestId("open-shifts-row")).toBeDefined();
  });

  it("does not render the Open shifts row when every shift is assigned", async () => {
    sessionRef.role = "admin";
    installFetchMock({ withShift: true });

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    // "Jane Doe" appears in both her staff row AND her shift chip — use
    // getAllByText to avoid a multiple-match throw.
    await waitFor(() => {
      expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId("open-shifts-row")).toBeNull();
  });

  it("excludes open shifts from ratio numerators (unfilled slot must not look compliant)", async () => {
    sessionRef.role = "admin";
    // ONE open (unassigned) ASC shift on Monday + 5 ASC children booked that
    // day. If the open shift counted toward the numerator the badge would
    // read "5:1 within limit"; the locked decision is that it must not, so
    // the cell shows a breach ("No staff rostered").
    installFetchMock({
      shifts: [
        {
          ...SHIFT_SAMPLE,
          id: "shift-open-1",
          userId: null,
          user: null,
          staffName: "Open shift",
          date: `${MONDAY_ISO}T12:00:00`,
          sessionType: "asc",
        },
      ],
      bookingsRoster: {
        [MONDAY_ISO]: {
          asc: Array.from({ length: 5 }, (_, i) => ({
            childId: `child-${i}`,
            firstName: `Kid${i}`,
            surname: "Test",
            bookingType: "permanent",
            hasMedical: false,
            hasDietary: false,
          })),
        },
      },
    });

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText("Open shifts")).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByText("No staff rostered")).toBeDefined();
    });
    expect(screen.queryByText(/within limit/i)).toBeNull();
  });

  it("honours a controlled weekStart prop and hides its own week picker", async () => {
    sessionRef.role = "admin";
    const capture = installFetchMock();

    const qc = makeClient();
    render(
      <ServiceWeeklyShiftsGrid serviceId="svc-1" weekStart="2026-08-31" />,
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => {
      const call = capture.calls.find(
        (c) =>
          c.url.includes("/api/roster/shifts") &&
          c.url.includes("weekStart=2026-08-31"),
      );
      expect(call).toBeDefined();
    });
    // Controlled without onWeekChange: the parent owns navigation.
    expect(screen.queryByRole("button", { name: /previous week/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next week/i })).toBeNull();
  });

  it("renders its own picker and delegates when onWeekChange is provided", async () => {
    sessionRef.role = "admin";
    installFetchMock();
    const onWeekChange = vi.fn();

    const qc = makeClient();
    render(
      <ServiceWeeklyShiftsGrid
        serviceId="svc-1"
        weekStart="2026-08-31"
        onWeekChange={onWeekChange}
      />,
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next week/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /next week/i }));
    expect(onWeekChange).toHaveBeenCalledWith("2026-09-07");
  });

  it("renders empty-state when service has no active staff", async () => {
    sessionRef.role = "admin";
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/team")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => [],
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ shifts: [] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const qc = makeClient();
    render(<ServiceWeeklyShiftsGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(screen.getByText(/no active staff/i)).toBeDefined();
    });
  });
});
