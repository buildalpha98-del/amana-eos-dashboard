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

import { RoomDaysTab } from "@/components/child/tabs/RoomDaysTab";
import type { ChildProfileRecord } from "@/components/child/types";

function makeChild(
  bookingPrefs: Record<string, unknown> | null = null,
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
    bookingPrefs,
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
  } as ChildProfileRecord;
}

describe("RoomDaysTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a 2-week × 3-session × 7-day grid (42 checkboxes)", () => {
    const { container } = render(
      <RoomDaysTab child={makeChild()} canEdit={true} />,
    );
    const checkboxes = container.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    expect(checkboxes.length).toBe(42);
    // All unchecked by default when bookingPrefs is null
    for (const cb of checkboxes) {
      expect(cb.checked).toBe(false);
    }
  });

  it("reflects existing fortnightPattern — checked cells match data", () => {
    const child = makeChild({
      fortnightPattern: {
        week1: { asc: ["mon", "tue"], bsc: [], vc: [] },
        week2: { vc: ["mon"], asc: [], bsc: [] },
      },
    });
    render(<RoomDaysTab child={child} canEdit={true} />);

    const mon1 = screen.getByLabelText("Week 1 After School Mon") as HTMLInputElement;
    const tue1 = screen.getByLabelText("Week 1 After School Tue") as HTMLInputElement;
    const wed1 = screen.getByLabelText("Week 1 After School Wed") as HTMLInputElement;
    expect(mon1.checked).toBe(true);
    expect(tue1.checked).toBe(true);
    expect(wed1.checked).toBe(false);

    const vcMon2 = screen.getByLabelText(
      "Week 2 Vacation Care Mon",
    ) as HTMLInputElement;
    expect(vcMon2.checked).toBe(true);
  });

  it("is read-only when canEdit is false — no Save button, disabled cells", () => {
    const { container } = render(
      <RoomDaysTab child={makeChild()} canEdit={false} />,
    );
    const saveButton = container.querySelector('button:has(svg)');
    expect(container.textContent).not.toContain("Save");
    const checkboxes = container.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true);
    }
    expect(saveButton).toBeNull();
  });

  it("toggling + saving sends only bookingPrefs.fortnightPattern in PATCH body", async () => {
    mutateApi.mockResolvedValueOnce({});
    render(<RoomDaysTab child={makeChild()} canEdit={true} />);

    const cell = screen.getByLabelText("Week 1 After School Mon") as HTMLInputElement;
    fireEvent.click(cell);

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mutateApi).toHaveBeenCalledTimes(1);
    });
    const [url, opts] = mutateApi.mock.calls[0] as [
      string,
      { method: string; body: { bookingPrefs: { fortnightPattern: unknown } } },
    ];
    expect(url).toBe("/api/children/child-1");
    expect(opts.method).toBe("PATCH");
    // The ONLY top-level key in the body must be bookingPrefs.
    expect(Object.keys(opts.body)).toEqual(["bookingPrefs"]);
    // And the ONLY key inside bookingPrefs must be fortnightPattern.
    expect(Object.keys(opts.body.bookingPrefs)).toEqual(["fortnightPattern"]);
    // The toggled day is present in the sent payload.
    expect(
      (opts.body.bookingPrefs.fortnightPattern as { week1: { asc: string[] } })
        .week1.asc,
    ).toContain("mon");
  });

  it("shows destructive toast on PATCH failure", async () => {
    mutateApi.mockRejectedValueOnce(new Error("Forbidden"));
    render(<RoomDaysTab child={makeChild()} canEdit={true} />);

    const cell = screen.getByLabelText("Week 1 After School Mon") as HTMLInputElement;
    fireEvent.click(cell);

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastCall = toastMock.mock.calls[0][0];
    expect(toastCall.variant).toBe("destructive");
    expect(toastCall.description).toContain("Forbidden");
  });
});
