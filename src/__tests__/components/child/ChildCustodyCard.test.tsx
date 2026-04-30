// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mutateApi = vi.fn();
const toastMock = vi.fn();

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: (...args: unknown[]) => mutateApi(...args),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
  useToast: () => ({ toast: toastMock }),
}));

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

import { ChildCustodyCard } from "@/components/child/tabs/ChildCustodyCard";
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
    nextImmunisationDue: null,
    custodyArrangements: null,
    ccsStatus: null,
    room: null,
    tags: [],
    photo: null,
    status: "active",
    ownaChildId: null,
    ownaRoomId: null,
    ownaRoomName: null,
    ownaSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    service: { id: "svc-1", name: "Bankstown", code: "BANK" },
    enrolment: null,
    ...overrides,
  } as unknown as ChildProfileRecord;
}

describe("ChildCustodyCard", () => {
  beforeEach(() => {
    mutateApi.mockReset();
    toastMock.mockReset();
    routerRefresh.mockReset();
  });

  it("shows empty state when no custody arrangements recorded", () => {
    render(<ChildCustodyCard child={makeChild()} canEdit={true} />);
    expect(
      screen.getByText(/No custody arrangements recorded/i),
    ).toBeTruthy();
  });

  it("hides Edit button when canEdit=false", () => {
    render(<ChildCustodyCard child={makeChild()} canEdit={false} />);
    expect(
      screen.queryByRole("button", { name: /Edit custody arrangements/i }),
    ).toBeNull();
    expect(
      screen.getByText(/can only be edited by coordinators/i),
    ).toBeTruthy();
  });

  it("renders existing custody arrangements (type + guardian + details)", () => {
    const child = makeChild({
      custodyArrangements: {
        type: "shared",
        primaryGuardian: "Sarah Nguyen",
        details: "50/50 alternating weeks",
      } as unknown as ChildProfileRecord["custodyArrangements"],
    });
    render(<ChildCustodyCard child={child} canEdit={true} />);
    expect(screen.getByText(/Shared/i)).toBeTruthy();
    expect(screen.getByText("Sarah Nguyen")).toBeTruthy();
    expect(screen.getByText(/alternating weeks/i)).toBeTruthy();
  });

  it("submits PATCH with structured custody object on save", async () => {
    mutateApi.mockResolvedValueOnce({});
    render(<ChildCustodyCard child={makeChild()} canEdit={true} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Edit custody arrangements/i }),
    );

    const typeSelect = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "court_order" } });

    const guardianInput = screen.getByPlaceholderText(/Sarah Doe/i);
    fireEvent.change(guardianInput, { target: { value: "Mum" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mutateApi).toHaveBeenCalledTimes(1);
    });
    const [url, opts] = mutateApi.mock.calls[0];
    expect(url).toBe("/api/children/child-1");
    expect(opts.method).toBe("PATCH");
    expect(opts.body.custodyArrangements).toEqual({
      type: "court_order",
      primaryGuardian: "Mum",
    });
  });

  it("submits null when type cleared back to 'Not recorded'", async () => {
    mutateApi.mockResolvedValueOnce({});
    const child = makeChild({
      custodyArrangements: {
        type: "shared",
      } as unknown as ChildProfileRecord["custodyArrangements"],
    });
    render(<ChildCustodyCard child={child} canEdit={true} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Edit custody arrangements/i }),
    );

    const typeSelect = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mutateApi).toHaveBeenCalledTimes(1);
    });
    expect(mutateApi.mock.calls[0][1].body.custodyArrangements).toBeNull();
  });
});
