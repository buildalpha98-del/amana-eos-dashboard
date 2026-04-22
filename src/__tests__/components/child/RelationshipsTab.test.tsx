// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

function makeChild(
  enrolment: ChildProfileRecord["enrolment"] = null,
): ChildProfileRecord {
  return {
    id: "child-1",
    enrolmentId: enrolment ? enrolment.id : null,
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
    enrolment,
  } as ChildProfileRecord;
}

function makeEnrolment(overrides: Partial<NonNullable<ChildProfileRecord["enrolment"]>> = {}) {
  return {
    id: "enrol-1",
    token: "tok",
    primaryParent: {
      firstName: "Linh",
      surname: "Nguyen",
      relationship: "Mother",
      mobile: "0411 111 111",
      email: "linh@example.com",
    },
    secondaryParent: null,
    emergencyContacts: [],
    authorisedPickup: [],
    consents: {},
    paymentMethod: null,
    paymentDetails: null,
    status: "submitted",
    createdAt: new Date(),
    ...overrides,
  } as NonNullable<ChildProfileRecord["enrolment"]>;
}

describe("RelationshipsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders primary carer with click-to-call and click-to-email links", () => {
    const enrolment = makeEnrolment();
    const { container } = render(
      <RelationshipsTab child={makeChild(enrolment)} canEdit={false} />,
    );
    expect(container.textContent).toContain("Linh");
    expect(container.textContent).toContain("Nguyen");
    expect(container.textContent).toContain("Mother");

    const telLink = container.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
    expect(telLink).not.toBeNull();
    expect(telLink!.getAttribute("href")).toContain("0411111111");

    const mailLink = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement | null;
    expect(mailLink).not.toBeNull();
    expect(mailLink!.getAttribute("href")).toBe("mailto:linh@example.com");
  });

  it("renders secondary carer when present, hides when null", () => {
    const withSecondary = makeEnrolment({
      secondaryParent: {
        firstName: "Binh",
        surname: "Nguyen",
        relationship: "Father",
        mobile: "0422 222 222",
        email: "binh@example.com",
      },
    });
    const r1 = render(
      <RelationshipsTab child={makeChild(withSecondary)} canEdit={false} />,
    );
    expect(r1.container.textContent).toContain("Secondary");
    expect(r1.container.textContent).toContain("Binh");
    r1.unmount();

    const r2 = render(
      <RelationshipsTab child={makeChild(makeEnrolment())} canEdit={false} />,
    );
    expect(r2.container.textContent).not.toContain("Binh");
  });

  it("renders emergency contacts list with N entries", () => {
    const enrolment = makeEnrolment({
      emergencyContacts: [
        {
          name: "Aunt May",
          relationship: "Aunt",
          phone: "0433 333 333",
          email: "may@example.com",
        },
        {
          name: "Uncle Ben",
          relationship: "Uncle",
          phone: "0444 444 444",
          email: "",
        },
      ],
    });
    const { container } = render(
      <RelationshipsTab child={makeChild(enrolment)} canEdit={false} />,
    );
    expect(container.textContent).toContain("Aunt May");
    expect(container.textContent).toContain("Uncle Ben");
    expect(container.textContent).toContain("Emergency Contacts");
  });

  it("renders authorised pickup list with N entries", () => {
    const enrolment = makeEnrolment({
      authorisedPickup: [
        { name: "Grandpa Joe", relationship: "Grandfather" },
        { name: "Neighbour Sue", relationship: "Family friend" },
      ],
    });
    const { container } = render(
      <RelationshipsTab child={makeChild(enrolment)} canEdit={false} />,
    );
    expect(container.textContent).toContain("Grandpa Joe");
    expect(container.textContent).toContain("Neighbour Sue");
    expect(container.textContent).toContain("Authorised Pickup");
  });

  it("shows empty state when enrolment is null", () => {
    const { container } = render(
      <RelationshipsTab child={makeChild(null)} canEdit={false} />,
    );
    expect(container.textContent).toContain("No enrolment data available");
  });
});
