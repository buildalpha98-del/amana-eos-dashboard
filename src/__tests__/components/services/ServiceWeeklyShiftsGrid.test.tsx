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

function installFetchMock(opts?: { withShift?: boolean }) {
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

    if (u.includes("/api/roster/shifts")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ shifts: opts?.withShift ? [SHIFT_SAMPLE] : [] }),
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
