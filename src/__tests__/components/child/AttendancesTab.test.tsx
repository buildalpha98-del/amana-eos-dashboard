// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted mocks
const useChildAttendancesMock = vi.fn();
const exportToCsvMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/hooks/useChildAttendances", () => ({
  useChildAttendances: (...args: unknown[]) => useChildAttendancesMock(...args),
}));

vi.mock("@/lib/csv-export", () => ({
  exportToCsv: (...args: unknown[]) => exportToCsvMock(...args),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { AttendancesTab } from "@/components/child/tabs/AttendancesTab";
import type { ChildProfileRecord } from "@/components/child/types";

function makeChild(
  overrides: Partial<ChildProfileRecord> = {},
): ChildProfileRecord {
  return {
    id: "child-1",
    enrolmentId: null,
    serviceId: "svc-1",
    firstName: "Amelia",
    surname: "Nguyen",
    dob: new Date("2018-03-10T00:00:00.000Z"),
    gender: "female",
    address: null,
    culturalBackground: [],
    schoolName: null,
    yearLevel: null,
    crn: null,
    medical: null,
    dietary: null,
    bookingPrefs: null,
    medicalConditions: [],
    medicationDetails: null,
    anaphylaxisActionPlan: false,
    dietaryRequirements: [],
    additionalNeeds: null,
    medicareNumber: null,
    medicareExpiry: null,
    medicareRef: null,
    vaccinationStatus: null,
    photo: null,
    status: "active",
    ownaChildId: null,
    ownaRoomId: null,
    ownaRoomName: null,
    ownaSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    service: { id: "svc-1", name: "Amana Centre", code: "AC" },
    enrolment: null,
    ...overrides,
  } as ChildProfileRecord;
}

interface MockRecord {
  id: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: "present" | "absent" | "booked";
  signInTime: string | null;
  signOutTime: string | null;
  signedInBy: { id: string; name: string } | null;
  signedOutBy: { id: string; name: string } | null;
  absenceReason: string | null;
  notes: string | null;
  fee: number | null;
}

function mockData(records: MockRecord[] = [], statsOverride?: Partial<{
  attendances: number;
  absences: number;
  totalFee: number;
  totalHours: number;
}>) {
  useChildAttendancesMock.mockReturnValue({
    data: {
      records,
      stats: {
        attendances: records.filter((r) => r.status === "present").length,
        absences: records.filter((r) => r.status === "absent").length,
        totalFee: records.reduce((s, r) => s + (r.fee ?? 0), 0),
        totalHours: 0,
        ...statsOverride,
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("AttendancesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stats tiles with values from the hook", () => {
    useChildAttendancesMock.mockReturnValue({
      data: {
        records: [],
        stats: {
          attendances: 12,
          absences: 3,
          totalFee: 450,
          totalHours: 36,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AttendancesTab child={makeChild()} />);

    expect(screen.getByText(/Attendances/i)).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/450\.00/)).toBeTruthy();
    expect(screen.getByText(/36\.0 h/)).toBeTruthy();
  });

  it("renders records rows when data is present", () => {
    mockData([
      {
        id: "ar-1",
        date: "2026-04-10",
        sessionType: "asc",
        status: "present",
        signInTime: "2026-04-10T05:00:00.000Z",
        signOutTime: "2026-04-10T08:00:00.000Z",
        signedInBy: { id: "s1", name: "Staff One" },
        signedOutBy: { id: "s1", name: "Staff One" },
        absenceReason: null,
        notes: "fine",
        fee: 30,
      },
      {
        id: "ar-2",
        date: "2026-04-11",
        sessionType: "bsc",
        status: "absent",
        signInTime: null,
        signOutTime: null,
        signedInBy: null,
        signedOutBy: null,
        absenceReason: "sick",
        notes: null,
        fee: null,
      },
    ]);

    render(<AttendancesTab child={makeChild()} />);

    expect(screen.getByText(/After School/)).toBeTruthy();
    expect(screen.getByText(/Before School/)).toBeTruthy();
    expect(screen.getAllByText(/Staff One/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sick/)).toBeTruthy();
    expect(screen.getByText(/present/)).toBeTruthy();
    expect(screen.getByText(/absent/)).toBeTruthy();
  });

  it("changing the from-date triggers the query with the new value", async () => {
    mockData([]);
    render(<AttendancesTab child={makeChild()} />);

    // First call uses the defaulted current-month range
    expect(useChildAttendancesMock).toHaveBeenCalled();

    const fromInput = screen.getByLabelText(/From date/i) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "2026-01-15" } });

    await waitFor(() => {
      const calls = useChildAttendancesMock.mock.calls;
      const last = calls[calls.length - 1];
      expect(last[1]).toBe("2026-01-15");
    });
  });

  it("clicking Export CSV invokes exportToCsv with a filename based on child + range", () => {
    mockData([
      {
        id: "ar-1",
        date: "2026-04-10",
        sessionType: "asc",
        status: "present",
        signInTime: null,
        signOutTime: null,
        signedInBy: null,
        signedOutBy: null,
        absenceReason: null,
        notes: null,
        fee: 30,
      },
    ]);

    render(<AttendancesTab child={makeChild({ firstName: "Amelia", surname: "Nguyen" })} />);

    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    fireEvent.click(exportBtn);

    expect(exportToCsvMock).toHaveBeenCalledTimes(1);
    const [filename, rows, columns] = exportToCsvMock.mock.calls[0];
    expect(filename).toMatch(/^attendances-amelia-nguyen-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as unknown[]).length).toBe(1);
    expect(Array.isArray(columns)).toBe(true);
  });

  it("shows empty state when there are no records", () => {
    mockData([]);
    render(<AttendancesTab child={makeChild()} />);
    expect(screen.getByText(/No attendance records/i)).toBeTruthy();
  });

  it("shows a loading indicator while the query is pending", () => {
    useChildAttendancesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AttendancesTab child={makeChild()} />);
    expect(screen.getByRole("status", { name: /Loading attendances/i })).toBeTruthy();
  });

  it("shows an error state when the query fails", () => {
    useChildAttendancesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Server down"),
      refetch: vi.fn(),
    });

    render(<AttendancesTab child={makeChild()} />);
    expect(screen.getByText(/Could not load attendances/i)).toBeTruthy();
    expect(screen.getByText(/Server down/i)).toBeTruthy();
  });

  it("Export CSV toasts when there are no records (and does not call exportToCsv)", () => {
    mockData([]);
    render(<AttendancesTab child={makeChild()} />);

    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    // Button is disabled when there are no records; attempting click still
    // shouldn't call exportToCsv.
    fireEvent.click(exportBtn);
    expect(exportToCsvMock).not.toHaveBeenCalled();
  });
});
