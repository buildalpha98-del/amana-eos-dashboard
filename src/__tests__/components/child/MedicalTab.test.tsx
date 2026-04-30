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

import { MedicalTab } from "@/components/child/tabs/MedicalTab";
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

describe("MedicalTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing medicalConditions checkboxes checked for present codes", () => {
    const child = makeChild({
      medicalConditions: ["anaphylaxis", "asthma"],
    });
    render(<MedicalTab child={child} canEdit={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const anaphylaxis = screen.getByLabelText(/Anaphylaxis/i) as HTMLInputElement;
    const asthma = screen.getByLabelText(/Asthma/i) as HTMLInputElement;
    const allergies = screen.getByLabelText(/Allergies/i) as HTMLInputElement;
    const dietary = screen.getByLabelText(/^Dietary$/i) as HTMLInputElement;

    expect(anaphylaxis.checked).toBe(true);
    expect(asthma.checked).toBe(true);
    expect(allergies.checked).toBe(false);
    expect(dietary.checked).toBe(false);
  });

  it("renders Medicare # + expiry + ref inputs populated from child", () => {
    const child = makeChild({
      medicareNumber: "1234567890",
      medicareExpiry: new Date("2027-06-30T00:00:00.000Z"),
      medicareRef: "1",
    });
    render(<MedicalTab child={child} canEdit={true} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const numberInput = screen.getByDisplayValue("1234567890");
    expect(numberInput).toBeTruthy();
    const refInput = screen.getByDisplayValue("1");
    expect(refInput).toBeTruthy();
    const expiryInput = screen.getByDisplayValue("2027-06-30");
    expect(expiryInput).toBeTruthy();
  });

  it("renders vaccination status dropdown with current value selected", () => {
    const child = makeChild({ vaccinationStatus: "overdue" });
    render(<MedicalTab child={child} canEdit={true} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const select = screen.getByLabelText(/Vaccination/i) as HTMLSelectElement;
    expect(select.value).toBe("overdue");
  });

  it("hides Edit button when canEdit is false", () => {
    const { container } = render(
      <MedicalTab child={makeChild()} canEdit={false} />,
    );
    expect(container.textContent).not.toContain("Edit");
  });

  it("Save sends correct PATCH body with medical fields", async () => {
    mutateApi.mockResolvedValueOnce({});
    const child = makeChild({
      medicalConditions: ["asthma"],
      medicareNumber: "1111111111",
      medicareRef: "2",
      vaccinationStatus: "unknown",
    });
    render(<MedicalTab child={child} canEdit={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    // Toggle anaphylaxis on
    const anaphylaxis = screen.getByLabelText(/Anaphylaxis/i) as HTMLInputElement;
    fireEvent.click(anaphylaxis);

    // Change medicare number
    const numberInput = screen.getByDisplayValue("1111111111") as HTMLInputElement;
    fireEvent.change(numberInput, { target: { value: "2222222222" } });

    // Change vaccination status
    const select = screen.getByLabelText(/Vaccination/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "up_to_date" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mutateApi).toHaveBeenCalledTimes(1);
    });
    const [url, opts] = mutateApi.mock.calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    expect(url).toBe("/api/children/child-1");
    expect(opts.method).toBe("PATCH");

    // Medical conditions must include asthma + anaphylaxis
    const conditions = opts.body.medicalConditions as string[];
    expect(conditions).toContain("asthma");
    expect(conditions).toContain("anaphylaxis");

    expect(opts.body.medicareNumber).toBe("2222222222");
    expect(opts.body.vaccinationStatus).toBe("up_to_date");
  });

  it("shows destructive toast on 403 error", async () => {
    mutateApi.mockRejectedValueOnce(new Error("Forbidden"));
    render(<MedicalTab child={makeChild()} canEdit={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    const anaphylaxis = screen.getByLabelText(/Anaphylaxis/i) as HTMLInputElement;
    fireEvent.click(anaphylaxis);

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const destructiveCall = toastMock.mock.calls.find((c) => c[0]?.variant === "destructive");
    expect(destructiveCall).toBeTruthy();
    expect(destructiveCall![0].description).toContain("Forbidden");
  });
});
