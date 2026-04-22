// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Session mock ────────────────────────────────────────────────
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

// ─── Toast mock ──────────────────────────────────────────────────
const toastSpy = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  toast: (opts: unknown) => toastSpy(opts),
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}));

// ─── fetch-api mock (mutateApi + fetchApi) ──────────────────────
const mutateApiSpy = vi.fn();
const fetchApiSpy = vi.fn();

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: (...args: unknown[]) => fetchApiSpy(...args),
  mutateApi: (...args: unknown[]) => mutateApiSpy(...args),
  ApiResponseError: class ApiResponseError extends Error {},
}));

// ─── Data-layer mock ────────────────────────────────────────────
// We drive `useWeeklyRollCall` via a mutable ref so tests can vary fixtures.
type WeeklyData = {
  children: Array<{
    id: string;
    firstName: string;
    surname: string;
    photo: string | null;
    dob: string | null;
    bookingPrefs: unknown;
  }>;
  attendanceRecords: Array<{
    id: string;
    childId: string;
    date: string;
    sessionType: "bsc" | "asc" | "vc";
    status: "booked" | "present" | "absent";
    signInTime: string | null;
    signOutTime: string | null;
    signedInById: string | null;
    signedOutById: string | null;
    absenceReason: string | null;
    notes: string | null;
  }>;
  bookings: Array<{
    id: string;
    childId: string;
    date: string;
    sessionType: "bsc" | "asc" | "vc";
    fee: number | null;
  }>;
  weekStart: string;
};

const weeklyRef: { data: WeeklyData | undefined } = { data: undefined };
const enrollableRef: {
  data: { children: WeeklyData["children"] } | undefined;
} = { data: undefined };

vi.mock("@/hooks/useWeeklyRollCall", () => ({
  useWeeklyRollCall: () => ({
    data: weeklyRef.data,
    isLoading: false,
    error: null,
  }),
  useEnrollableChildren: () => ({
    data: enrollableRef.data,
    isLoading: false,
    error: null,
  }),
}));

import { ServiceWeeklyRollCallGrid } from "@/components/services/ServiceWeeklyRollCallGrid";

// ─── Helpers ────────────────────────────────────────────────────

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

// Build a monday-of-this-week YYYY-MM-DD to mimic the grid's internal calc.
function mondayIso(): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function makeData(
  overrides: Partial<WeeklyData> = {},
): WeeklyData {
  const ws = mondayIso();
  return {
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
        date: `${ws}T00:00:00.000Z`,
        sessionType: "asc",
        fee: null,
      },
    ],
    weekStart: ws,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceWeeklyRollCallGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
    weeklyRef.data = undefined;
    enrollableRef.data = undefined;
  });

  it("shows empty-state when data.children is empty", () => {
    weeklyRef.data = makeData({ children: [], bookings: [] });
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(screen.getByText(/No children on roster/i)).toBeDefined();
  });

  it("renders child row + weekly cells when data is present", () => {
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(screen.getByText(/Ava Nguyen/)).toBeDefined();
    // 5 day columns worth of cells; at least the booked ASC cell should render.
    const monday = mondayIso();
    expect(
      screen.getByTestId(`weekly-cell-shift-child-1-${monday}-asc`),
    ).toBeDefined();
  });

  it("hides '+ Add child to week' header button when canEdit=false", () => {
    sessionRef.role = "member";
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(screen.queryByRole("button", { name: /add child to week/i })).toBeNull();
  });

  it("shows '+ Add child to week' header button for admin", () => {
    sessionRef.role = "admin";
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(screen.getByRole("button", { name: /add child to week/i })).toBeDefined();
  });

  it("hides '+ Add child to week' for a coordinator at a DIFFERENT service (not same-service)", () => {
    // Per spec matrix: coordinator is R/W only at THEIR OWN service, 403 elsewhere.
    sessionRef.role = "coordinator";
    sessionRef.serviceId = "svc-OTHER"; // viewing svc-1 while assigned to svc-OTHER
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(
      screen.queryByRole("button", { name: /add child to week/i }),
    ).toBeNull();
  });

  it("shows '+ Add child to week' for a coordinator at THEIR OWN service", () => {
    sessionRef.role = "coordinator";
    sessionRef.serviceId = "svc-1";
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });
    expect(
      screen.getByRole("button", { name: /add child to week/i }),
    ).toBeDefined();
  });

  it("clicking a booked cell opens the popover with Sign in + Mark absent", async () => {
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    const monday = mondayIso();
    fireEvent.click(
      screen.getByTestId(`weekly-cell-shift-child-1-${monday}-asc`),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /mark absent/i })).toBeDefined();
    });
  });

  it("clicking a signed_in cell opens the popover with Sign out + Undo", async () => {
    const ws = mondayIso();
    weeklyRef.data = makeData({
      bookings: [],
      attendanceRecords: [
        {
          id: "rec-1",
          childId: "child-1",
          date: `${ws}T00:00:00.000Z`,
          sessionType: "asc",
          status: "present",
          signInTime: "2026-01-05T06:00:00.000Z",
          signOutTime: null,
          signedInById: "user-self",
          signedOutById: null,
          absenceReason: null,
          notes: null,
        },
      ],
    });

    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    fireEvent.click(screen.getByTestId(`weekly-cell-shift-child-1-${ws}-asc`));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign out/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^undo$/i })).toBeDefined();
    });
  });

  it("clicking Sign in calls mutateApi with correct body", async () => {
    mutateApiSpy.mockResolvedValue({ id: "new-rec-id" });
    const ws = mondayIso();
    weeklyRef.data = makeData();
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    fireEvent.click(screen.getByTestId(`weekly-cell-shift-child-1-${ws}-asc`));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mutateApiSpy).toHaveBeenCalled();
    });

    const [url, init] = mutateApiSpy.mock.calls[0];
    expect(url).toBe("/api/attendance/roll-call");
    expect(init.method).toBe("POST");
    expect(init.body).toMatchObject({
      serviceId: "svc-1",
      childId: "child-1",
      sessionType: "asc",
      action: "sign_in",
    });
  });

  it("AddChildDialog renders enrollable children when opened", async () => {
    weeklyRef.data = makeData();
    enrollableRef.data = {
      children: [
        {
          id: "child-2",
          firstName: "Ben",
          surname: "Park",
          photo: null,
          dob: null,
          bookingPrefs: null,
        },
      ],
    };
    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    fireEvent.click(screen.getByRole("button", { name: /add child to week/i }));

    await waitFor(() => {
      expect(screen.getByText(/Ben Park/)).toBeDefined();
    });
  });


  it("AddChildDialog submit calls mutateApi with action='undo' per selection", async () => {
    mutateApiSpy.mockResolvedValue({ id: "new-rec" });
    weeklyRef.data = makeData();
    enrollableRef.data = {
      children: [
        {
          id: "child-2",
          firstName: "Ben",
          surname: "Park",
          photo: null,
          dob: null,
          bookingPrefs: null,
        },
      ],
    };

    const qc = makeClient();
    render(<ServiceWeeklyRollCallGrid serviceId="svc-1" />, {
      wrapper: makeWrapper(qc),
    });

    fireEvent.click(screen.getByRole("button", { name: /add child to week/i }));

    const monday = mondayIso();

    await waitFor(() => {
      expect(
        screen.getByTestId(`addchild-cell-child-2-${monday}-asc`),
      ).toBeDefined();
    });

    // Select the Monday ASC cell for Ben.
    fireEvent.click(screen.getByTestId(`addchild-cell-child-2-${monday}-asc`));

    // Click "Add 1"
    fireEvent.click(screen.getByRole("button", { name: /add 1/i }));

    await waitFor(() => {
      expect(mutateApiSpy).toHaveBeenCalled();
    });

    const [url, init] = mutateApiSpy.mock.calls[0];
    expect(url).toBe("/api/attendance/roll-call");
    expect(init.method).toBe("POST");
    expect(init.body).toMatchObject({
      serviceId: "svc-1",
      childId: "child-2",
      sessionType: "asc",
      action: "undo",
    });
  });
});
