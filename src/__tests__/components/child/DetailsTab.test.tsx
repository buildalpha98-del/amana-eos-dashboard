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

import { DetailsTab } from "@/components/child/tabs/DetailsTab";
import type { ChildProfileRecord } from "@/components/child/types";

function makeChild(overrides: Partial<ChildProfileRecord> = {}): ChildProfileRecord {
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
    schoolName: "Sunrise Primary",
    yearLevel: "3",
    crn: "1234567890",
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

describe("DetailsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders child details in view mode (no inputs)", () => {
    const { container } = render(
      <DetailsTab child={makeChild()} canEdit={false} />,
    );
    expect(container.textContent).toContain("Amelia");
    expect(container.textContent).toContain("Nguyen");
    expect(container.textContent).toContain("Sunrise Primary");
    // No inputs rendered in view mode.
    expect(container.querySelectorAll("input").length).toBe(0);
  });

  it("hides Edit button when canEdit is false", () => {
    const { container } = render(
      <DetailsTab child={makeChild()} canEdit={false} />,
    );
    expect(container.textContent).not.toContain("Edit");
  });

  it("shows Edit button when canEdit is true", () => {
    const { container } = render(
      <DetailsTab child={makeChild()} canEdit={true} />,
    );
    expect(container.textContent).toContain("Edit");
  });

  it("entering edit mode reveals inputs for all 11 fields", () => {
    const { container } = render(
      <DetailsTab child={makeChild()} canEdit={true} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    // First name, surname, dob, photo, school, year, crn, enrolmentDate, exitDate, exitCategory = 10 <input>
    // plus exit reason textarea, plus gender + status selects
    expect(container.querySelectorAll("input").length).toBeGreaterThanOrEqual(10);
    expect(container.querySelectorAll("select").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll("textarea").length).toBeGreaterThanOrEqual(1);
  });

  it("Save sends only dirty fields via mutateApi PATCH", async () => {
    mutateApi.mockResolvedValueOnce({});
    render(<DetailsTab child={makeChild()} canEdit={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    // Change schoolName only — other fields remain at initial values.
    const schoolInput = screen.getByDisplayValue("Sunrise Primary") as HTMLInputElement;
    fireEvent.change(schoolInput, { target: { value: "Oakwood Primary" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mutateApi).toHaveBeenCalledTimes(1);
    });
    const [url, opts] = mutateApi.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe("/api/children/child-1");
    expect(opts.method).toBe("PATCH");
    expect(opts.body).toEqual({ schoolName: "Oakwood Primary" });
    // Only the one dirty key — not the whole form
    expect(Object.keys(opts.body)).toHaveLength(1);
  });

  it("shows destructive toast on 403 error", async () => {
    mutateApi.mockRejectedValueOnce(new Error("Forbidden"));
    render(<DetailsTab child={makeChild()} canEdit={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const schoolInput = screen.getByDisplayValue("Sunrise Primary") as HTMLInputElement;
    fireEvent.change(schoolInput, { target: { value: "Something else" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastCall = toastMock.mock.calls[0][0];
    expect(toastCall.variant).toBe("destructive");
    expect(toastCall.description).toContain("Forbidden");
  });
});
