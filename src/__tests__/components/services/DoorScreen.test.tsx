// @vitest-environment jsdom
/**
 * The door (staff-UX Round 3, 2026-10-09): Sign In / Out and Roll Call
 * merged into one screen. These pin the behaviour staff rely on at pick-up.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useToast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

const child = (id: string, firstName: string, extra: Record<string, unknown> = {}) => ({
  id,
  firstName,
  surname: "Test",
  photo: null,
  medicalConditions: [],
  dietaryRequirements: [],
  anaphylaxisActionPlan: false,
  medicationDetails: null,
  medical: null,
  dietary: null,
  yearLevel: null,
  custodyArrangements: null,
  allAboutMe: null,
  ...extra,
});
const entry = (id: string, firstName: string, over: Record<string, unknown> = {}, childExtra = {}) => ({
  childId: id,
  attendanceId: over.status && over.status !== "booked" ? `att-${id}` : null,
  child: child(id, firstName, childExtra),
  bookingType: "permanent",
  status: "booked",
  signInTime: null,
  signOutTime: null,
  signedInBy: null,
  signedOutBy: null,
  absenceReason: null,
  notes: null,
  firstDayPhotoSentAt: null,
  firstDayPhotoUrl: null,
  ...over,
});

// Server order is status-first; the door must show NAME order regardless.
const RECORDS = [
  entry("c-here", "Zara", { status: "present", signInTime: "2026-10-09T04:05:00Z", signedInByName: "Collected from class by educators" }),
  entry("c-gone", "Yusuf", { status: "present", signInTime: "2026-10-09T04:05:00Z", signOutTime: "2026-10-09T07:40:00Z", signedOutByName: "Mariam Test" }),
  entry("c-arr", "Adam", {}, { anaphylaxisActionPlan: true }),
  entry("c-arr2", "Bilal"),
  entry("c-abs", "Huda", { status: "absent", absenceReason: "Sick" }),
];

const updateMutate = vi.fn();
const bulkMutate = vi.fn();
vi.mock("@/hooks/useRollCall", () => ({
  useRollCall: () => ({ data: { records: RECORDS, summary: {} }, isLoading: false, error: null }),
  useUpdateRollCall: () => ({ mutate: updateMutate, isPending: false }),
  useBulkRollCall: () => ({ mutate: bulkMutate, isPending: false }),
  useSendFirstDayPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  uploadFirstDayPhoto: vi.fn(),
}));
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(async () => ({ settings: { signInOut: { requireSignature: false } } })),
  mutateApi: vi.fn(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "staff", serviceId: "svc-1" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ServiceRollCallTab, doorState } from "@/components/services/ServiceRollCallTab";

const room = (legacyKey: string, name: string, i: number) => ({
  id: `room-${legacyKey}`, legacyKey, name, sortOrder: i, startTime: null, endTime: null, capacity: null,
  ratio: null, description: null, minAgeYears: null, maxAgeYears: null, photoUrl: null, staffOnly: false,
  archivedAt: null, fees: [], archivedFees: [],
});

function renderDoor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false } } });
  qc.setQueryData(["service-rooms", "svc-1", "active"], {
    rooms: [room("bsc", "Rise and Shine", 0), room("asc", "Amana Afternoons", 1)],
  });
  return render(
    <QueryClientProvider client={qc}>
      <ServiceRollCallTab serviceId="svc-1" />
    </QueryClientProvider>,
  );
}

const rowFor = (name: string) => screen.getByText(`${name} Test`).closest("li") as HTMLElement;

beforeEach(() => {
  updateMutate.mockClear();
  bulkMutate.mockClear();
});

describe("doorState", () => {
  it("maps a record to the four door colours", () => {
    expect(doorState({ status: "booked", signOutTime: null })).toBe("arriving");
    expect(doorState({ status: "present", signOutTime: null })).toBe("here");
    expect(doorState({ status: "present", signOutTime: "x" })).toBe("gone");
    expect(doorState({ status: "absent", signOutTime: null })).toBe("absent");
  });
});

describe("the door", () => {
  it("lists children by name, never reshuffled by status", () => {
    renderDoor();
    const names = screen.getAllByRole("listitem").map((li) => within(li).getByText(/ Test$/, { selector: "p.font-semibold" }).textContent);
    expect(names).toEqual(["Adam Test", "Bilal Test", "Huda Test", "Yusuf Test", "Zara Test"]);
  });

  it("counts each colour and filters to it", () => {
    renderDoor();
    const arriving = screen.getByRole("button", { name: /To arrive\s*2/ });
    expect(screen.getByRole("button", { name: /Here\s*1/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Gone home\s*1/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Absent\s*1/ })).toBeDefined();
    fireEvent.click(arriving);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the anaphylaxis flag at the door", () => {
    renderDoor();
    expect(within(rowFor("Adam")).getByText("Anaphylaxis")).toBeDefined();
  });

  it("signs in with one tap in the afternoon programme", () => {
    renderDoor();
    fireEvent.click(within(rowFor("Adam")).getByRole("button", { name: /^Sign in$/ }));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "c-arr", action: "sign_in", sessionType: "asc" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks who's dropping off in the morning programme", () => {
    renderDoor();
    fireEvent.click(screen.getByRole("button", { name: "Rise and Shine" }));
    fireEvent.click(within(rowFor("Adam")).getByRole("button", { name: /^Sign in$/ }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByLabelText(/Name of person dropping off/)).toBeDefined();
  });

  it("always asks who is collecting, and records it", () => {
    renderDoor();
    fireEvent.click(within(rowFor("Zara")).getByRole("button", { name: /Sign out/ }));
    const input = screen.getByLabelText(/Name of person collecting/);
    fireEvent.change(input, { target: { value: "Fatima Test" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm sign out/ }));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "c-here", action: "sign_out", signedByName: "Fatima Test", signMethod: "staff" }),
    );
  });

  it("marks absent in one tap, and undoes it from the row", () => {
    renderDoor();
    fireEvent.click(within(rowFor("Bilal")).getByRole("button", { name: /Mark Bilal absent/ }));
    expect(updateMutate).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "c-arr2", action: "mark_absent" }));
    fireEvent.click(within(rowFor("Huda")).getByRole("button", { name: /Undo absent for Huda/ }));
    expect(updateMutate).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "c-abs", action: "undo" }));
  });

  it("signs in everyone still to arrive, with a note for the register", () => {
    renderDoor();
    fireEvent.click(screen.getByRole("button", { name: /Sign in all 2/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Sign in 2$/ }));
    expect(bulkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sign_in",
        childIds: ["c-arr", "c-arr2"],
        signedByName: "Collected from class by educators",
        notify: true,
      }),
      expect.anything(),
    );
  });

  it("shows who collected a child who has gone home", () => {
    renderDoor();
    expect(within(rowFor("Yusuf")).getByText(/Mariam Test/)).toBeDefined();
  });
});
