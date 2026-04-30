// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ──────────────────────────────────────────────────────

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", email: "me@test", role: "admin" } },
    status: "authenticated",
  }),
}));

const toastSpy = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
  useToast: () => ({ toast: toastSpy }),
}));

const mutateApiMock = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(() => Promise.resolve([])),
  mutateApi: (...args: unknown[]) => mutateApiMock(...args),
}));

const attendanceRecords: Array<{
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  enrolled: number;
  attended: number;
  capacity: number;
  casual: number;
  absent: number;
}> = [];

function buildWeekMondayIso() {
  const now = new Date();
  const day = now.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

vi.mock("@/hooks/useAttendance", async () => {
  const mod = await vi.importActual<typeof import("@/hooks/useAttendance")>(
    "@/hooks/useAttendance"
  );
  return {
    ...mod,
    useAttendance: () => ({ data: attendanceRecords, isLoading: false }),
    useAttendanceSummary: () => ({ data: undefined, isLoading: false }),
    useBatchUpdateAttendance: () => ({
      mutateAsync: vi.fn(() => Promise.resolve({ updated: 0 })),
      isPending: false,
    }),
    useCreateAttendance: () => ({
      mutate: vi.fn((_payload, opts) => {
        opts?.onSuccess?.({ id: "att-new" }, _payload);
      }),
      isPending: false,
    }),
  };
});

vi.mock("@/hooks/useServices", () => ({
  useService: () => ({ data: { id: "svc-1", name: "Greenacre", capacity: 120 } }),
}));

vi.mock("@/components/import/ImportWizard", () => ({
  ImportWizard: () => null,
}));

vi.mock("@/components/ui/AiButton", () => ({
  AiButton: () => null,
}));

import { ServiceAttendanceTab } from "@/components/services/ServiceAttendanceTab";

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function seedWeek() {
  attendanceRecords.length = 0;
  const monday = buildWeekMondayIso();
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString();
    attendanceRecords.push(
      {
        date: iso,
        sessionType: "bsc",
        enrolled: 7, // permanent
        attended: 2, // casual
        capacity: 120,
        casual: 0,
        absent: 0,
      },
      {
        date: iso,
        sessionType: "asc",
        enrolled: 18,
        attended: 5,
        capacity: 120,
        casual: 0,
        absent: 0,
      },
      {
        date: iso,
        sessionType: "vc",
        enrolled: 3,
        attended: 1,
        capacity: 120,
        casual: 0,
        absent: 0,
      }
    );
  }
}

describe("ServiceAttendanceTab — weekly grid", () => {
  beforeEach(() => {
    // Reset per-centre toggle so each test starts without Holiday Quest
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    seedWeek();
    mutateApiMock.mockClear();
  });

  it("renders branded session labels for BSC and ASC by default (VC hidden)", () => {
    render(<ServiceAttendanceTab serviceId="svc-1" serviceName="Greenacre" />, {
      wrapper: wrapper(makeClient()),
    });
    expect(screen.getAllByText("Rise and Shine Club (BSC)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Amana Afternoons (ASC)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Holiday Quest (VC)")).toBeNull();
  });

  it("computes a daily Total bookings row that sums permanent + casual across visible sessions", () => {
    render(<ServiceAttendanceTab serviceId="svc-1" serviceName="Greenacre" />, {
      wrapper: wrapper(makeClient()),
    });
    // Each day without Holiday Quest: BSC 7+2 + ASC 18+5 = 32
    const totalRow = screen.getByText("Total bookings").closest("tr");
    expect(totalRow).toBeTruthy();
    const totals = within(totalRow as HTMLElement).getAllByText("32");
    expect(totals.length).toBe(5); // one per weekday
  });

  it("renders an Approved places row reading from service.capacity", () => {
    render(<ServiceAttendanceTab serviceId="svc-1" serviceName="Greenacre" />, {
      wrapper: wrapper(makeClient()),
    });
    const capacityRow = screen.getByText("Approved places").closest("tr");
    expect(capacityRow).toBeTruthy();
    const cells = within(capacityRow as HTMLElement).getAllByText("120");
    expect(cells.length).toBe(5);
  });

  it("toggling Holiday Quest shows VC rows and includes them in daily totals", () => {
    render(<ServiceAttendanceTab serviceId="svc-1" serviceName="Greenacre" />, {
      wrapper: wrapper(makeClient()),
    });

    const toggle = screen.getByLabelText("Show Holiday Quest row");
    fireEvent.click(toggle);

    expect(screen.getAllByText("Holiday Quest (VC)").length).toBeGreaterThan(0);
    // New total per day: BSC 9 + ASC 23 + VC 4 = 36
    const totalRow = screen.getByText("Total bookings").closest("tr");
    const updatedTotals = within(totalRow as HTMLElement).getAllByText("36");
    expect(updatedTotals.length).toBe(5);
  });

  it("uses Holiday Quest branding on the toggle itself", () => {
    render(<ServiceAttendanceTab serviceId="svc-1" serviceName="Greenacre" />, {
      wrapper: wrapper(makeClient()),
    });
    expect(screen.getByText("Show Holiday Quest")).toBeTruthy();
    expect(screen.queryByText("Show VC")).toBeNull();
  });
});
