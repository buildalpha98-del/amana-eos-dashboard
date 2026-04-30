// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { RelationshipsTab } from "@/components/child/tabs/RelationshipsTab";
import type { ChildProfileRecord } from "@/components/child/types";
import * as fetchApi from "@/lib/fetch-api";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeChild(
  enrolment: ChildProfileRecord["enrolment"] = null,
): ChildProfileRecord {
  return {
    id: "c1",
    enrolmentId: enrolment ? enrolment.id : null,
    serviceId: "svc-1",
    firstName: "Alice",
    surname: "A",
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
    service: { id: "svc-1", name: "Amana Centre", code: "AC" },
    enrolment,
  } as ChildProfileRecord;
}

const baseEnrolment = {
  id: "enr1",
  token: "t",
  primaryParent: {
    firstName: "Mum",
    surname: "M",
    relationship: "Mother",
  },
  secondaryParent: null,
  emergencyContacts: [],
  authorisedPickup: [],
  consents: {},
  paymentMethod: null,
  paymentDetails: {},
  status: "active",
  createdAt: new Date(),
} as NonNullable<ChildProfileRecord["enrolment"]>;

describe("RelationshipsTab — inline edit (4b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Add/Edit buttons when canEdit=true", () => {
    wrap(<RelationshipsTab child={makeChild(baseEnrolment)} canEdit />);
    expect(
      screen.getByRole("button", { name: /add secondary carer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add emergency contact/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add authorised pickup/i }),
    ).toBeInTheDocument();
  });

  it("hides Add/Edit buttons when canEdit=false (staff read-only)", () => {
    wrap(
      <RelationshipsTab child={makeChild(baseEnrolment)} canEdit={false} />,
    );
    expect(
      screen.queryByRole("button", { name: /add secondary carer/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add emergency contact/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add authorised pickup/i }),
    ).not.toBeInTheDocument();
  });

  it("drops the 'Inline editing will ship in a later sub-project' hint", () => {
    wrap(<RelationshipsTab child={makeChild(baseEnrolment)} canEdit />);
    expect(
      screen.queryByText(/inline editing will ship/i),
    ).not.toBeInTheDocument();
  });

  it("posts a PATCH when a secondary carer is added", async () => {
    const mutate = vi.spyOn(fetchApi, "mutateApi").mockResolvedValue({});
    wrap(<RelationshipsTab child={makeChild(baseEnrolment)} canEdit />);

    fireEvent.click(
      screen.getByRole("button", { name: /add secondary carer/i }),
    );
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Dad" },
    });
    fireEvent.change(screen.getByLabelText("Surname"), {
      target: { value: "D" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate).toHaveBeenCalledWith(
      "/api/children/c1/relationships",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          secondaryParent: expect.objectContaining({
            firstName: "Dad",
            surname: "D",
          }),
        }),
      }),
    );
  });
});
