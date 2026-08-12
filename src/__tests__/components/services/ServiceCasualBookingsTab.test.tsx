// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────

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

const toastSpy = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
  useToast: () => ({ toast: toastSpy }),
}));

const mutateApiMock = vi.fn();
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: (...args: unknown[]) => mutateApiMock(...args),
}));

import { ServiceCasualBookingsTab } from "@/components/services/ServiceCasualBookingsTab";

// ─── Helpers ─────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/**
 * The rooms a centre with no customisation has.
 *
 * Stage 2 of docs/rooms-migration-plan.md: this tab takes its cards
 * from room RECORDS now rather than enumerating the seven enum slots,
 * so the rooms have to come from somewhere. Seeding the query cache
 * rather than mocking `fetchApi` keeps every assertion below synchronous
 * — the alternative was making fifteen tests await a resolved query to
 * assert something that has nothing to do with loading.
 */
const DEFAULT_ROOM_RECORDS = [
  { legacyKey: "bsc", name: "Rise and Shine", startTime: "06:30", endTime: "09:00" },
  { legacyKey: "asc", name: "Amana Afternoons", startTime: "15:00", endTime: "18:30" },
  { legacyKey: "vc", name: "Holiday Quest", startTime: "07:00", endTime: "18:00" },
].map((r, i) => ({
  id: `room-${r.legacyKey}`,
  capacity: null,
  ratio: null,
  description: null,
  minAgeYears: null,
  maxAgeYears: null,
  photoUrl: null,
  staffOnly: false,
  archivedAt: null,
  fees: [],
  archivedFees: [],
  sortOrder: i,
  ...r,
}));

function makeClient(
  rooms: Array<Record<string, unknown>> = DEFAULT_ROOM_RECORDS,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  qc.setQueryData(["service-rooms", "svc-1", "active"], { rooms });
  return qc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeService(overrides: Record<string, unknown> = {}): any {
  return {
    id: "svc-1",
    casualBookingSettings: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceCasualBookingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastSpy.mockReset();
    mutateApiMock.mockReset();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
  });

  it("tells the coordinator these settings are actually enforced", () => {
    // 2026-08-06: this used to assert a banner reading "not yet
    // enforced … ships in a follow-up sub-project". That follow-up had
    // already shipped — checkCasualBookingAllowed is wired into the
    // parent create, bulk and cancellation routes — and the stale
    // warning was telling coordinators their policy was decorative.
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByText(/these settings are enforced/i)).toBeDefined();
    expect(screen.queryByText(/not yet enforced/i)).toBeNull();
    expect(screen.queryByText(/follow-up sub-project/i)).toBeNull();
  });

  it("renders the preview card with the empty-state message when no sessions are enabled", () => {
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByText(/Policy preview/i)).toBeDefined();
    expect(screen.getByText(/No sessions enabled/i)).toBeDefined();
  });

  it("renders a plain-English preview line per enabled session", () => {
    const service = makeService({
      casualBookingSettings: {
        bsc: {
          enabled: true,
          fee: 36,
          spots: 10,
          cutOffHours: 24,
          days: ["mon", "tue"],
        },
        asc: {
          enabled: true,
          fee: 42,
          spots: 8,
          cutOffHours: 12,
          days: ["mon"],
        },
      },
    });

    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={service} />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.getByText(
        /Parents can book casual Rise and Shine up to 24 hours before the session at \$36\.00 \(10 spots available\)\./i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /Parents can book casual Amana Afternoons up to 12 hours before the session at \$42\.00 \(8 spots available\)\./i,
      ),
    ).toBeDefined();
  });

  it("renders three session cards (BSC / ASC / VC) with initial values from service", () => {
    const service = makeService({
      casualBookingSettings: {
        bsc: {
          enabled: true,
          fee: 36,
          spots: 10,
          cutOffHours: 24,
          days: ["mon", "tue", "wed", "thu", "fri"],
        },
        asc: {
          enabled: false,
          fee: 42,
          spots: 8,
          cutOffHours: 12,
          days: [],
        },
        vc: {
          enabled: false,
          fee: 0,
          spots: 0,
          cutOffHours: 48,
          days: [],
        },
      },
    });

    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={service} />, {
      wrapper: makeWrapper(qc),
    });

    const bscCard = screen.getByTestId("casual-card-bsc");
    const ascCard = screen.getByTestId("casual-card-asc");
    const vcCard = screen.getByTestId("casual-card-vc");

    expect(bscCard).toBeDefined();
    expect(ascCard).toBeDefined();
    expect(vcCard).toBeDefined();

    // BSC initial values
    const bscFee = screen.getByLabelText(/BSC fee/i) as HTMLInputElement;
    expect(bscFee.value).toBe("36");

    const bscSpots = screen.getByLabelText(/BSC spots/i) as HTMLInputElement;
    expect(bscSpots.value).toBe("10");

    const bscCutOff = screen.getByLabelText(
      /BSC cut-off hours/i,
    ) as HTMLInputElement;
    expect(bscCutOff.value).toBe("24");
  });

  it("hides the save button for staff role (read-only)", () => {
    sessionRef.role = "staff";
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.queryByRole("button", { name: /save settings/i }),
    ).toBeNull();
  });

  it("hides the save button for member and marketing roles", () => {
    sessionRef.role = "member";
    const qc = makeClient();
    const { unmount } = render(
      <ServiceCasualBookingsTab service={makeService()} />,
      { wrapper: makeWrapper(qc) },
    );
    expect(
      screen.queryByRole("button", { name: /save settings/i }),
    ).toBeNull();
    unmount();

    sessionRef.role = "marketing";
    const qc2 = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc2),
    });
    expect(
      screen.queryByRole("button", { name: /save settings/i }),
    ).toBeNull();
  });

  it("shows the save button for admin users", () => {
    sessionRef.role = "admin";
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.getByRole("button", { name: /save settings/i }),
    ).toBeDefined();
  });

  it("shows the save button for coordinator of the same service", () => {
    sessionRef.role = "member";
    sessionRef.serviceId = "svc-1";
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.getByRole("button", { name: /save settings/i }),
    ).toBeDefined();
  });

  it("hides the save button for coordinator of another service", () => {
    sessionRef.role = "member";
    sessionRef.serviceId = "svc-other";
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(
      screen.queryByRole("button", { name: /save settings/i }),
    ).toBeNull();
  });

  it("save triggers mutateApi with full {bsc, asc, vc} blob", async () => {
    sessionRef.role = "admin";
    mutateApiMock.mockResolvedValue({ service: { id: "svc-1" } });

    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mutateApiMock).toHaveBeenCalledTimes(1);
    });

    const [url, opts] = mutateApiMock.mock.calls[0] as [
      string,
      { method: string; body: unknown },
    ];
    expect(url).toBe("/api/services/svc-1/casual-settings");
    expect(opts.method).toBe("PATCH");
    const body = opts.body as Record<string, unknown>;
    // Full blob — all three keys always present
    expect(body).toHaveProperty("bsc");
    expect(body).toHaveProperty("asc");
    expect(body).toHaveProperty("vc");
  });

  it("surfaces a destructive toast when the save request fails (403)", async () => {
    sessionRef.role = "admin";
    mutateApiMock.mockRejectedValue(new Error("Forbidden"));

    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalled();
    });

    const call = toastSpy.mock.calls.find((c) => {
      const arg = c[0] as { variant?: string };
      return arg?.variant === "destructive";
    });
    expect(call).toBeDefined();
    const payload = call![0] as { variant: string; description: string };
    expect(payload.variant).toBe("destructive");
    expect(payload.description).toMatch(/Forbidden/i);
  });

  it("invalidates the service query and toasts on successful save", async () => {
    sessionRef.role = "admin";
    mutateApiMock.mockResolvedValue({ service: { id: "svc-1" } });

    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mutateApiMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["service", "svc-1"],
      });
    });

    // Success toast (non-destructive)
    const okCall = toastSpy.mock.calls.find((c) => {
      const arg = c[0] as { variant?: string; description?: string };
      return !arg?.variant || arg.variant !== "destructive";
    });
    expect(okCall).toBeDefined();
  });
});

/**
 * Stage 2 of docs/rooms-migration-plan.md — the cards come from room
 * records, not from the seven enum slots. What's worth pinning is the
 * behaviour that used to be impossible: a centre's eighth room getting
 * a settings card without anyone editing this file.
 */
describe("ServiceCasualBookingsTab — rooms as records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastSpy.mockReset();
    mutateApiMock.mockReset();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
  });

  const room = (over: Record<string, unknown>) => ({
    ...DEFAULT_ROOM_RECORDS[0],
    ...over,
  });

  it("gives a room the enum never enumerated its own card", () => {
    // The point of the whole stage. Previously this list was
    // activeSessionKeys(sessionTimes), so a room only appeared if its
    // slot was one of the seven and had a label in the JSON.
    const qc = makeClient([
      room({ id: "room-x", legacyKey: "extra1", name: "Homework Club" }),
    ]);
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByTestId("casual-card-extra1")).toBeDefined();
    expect(screen.getByText("Homework Club")).toBeDefined();
  });

  it("shows the room's own name, not the slot code", () => {
    const qc = makeClient([room({ name: "Sunrise Crew" })]);
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByText("Sunrise Crew")).toBeDefined();
    expect(screen.queryByText("Rise and Shine")).toBeNull();
  });

  it("leaves out a room with no legacy key rather than showing settings that can't save", () => {
    // The settings blob and the booking record are both keyed by slot
    // until Stage 4, so such a room has nowhere to store its settings.
    // A card that silently discards what's typed into it is worse than
    // no card.
    const qc = makeClient([
      room({ id: "room-new", legacyKey: null, name: "Sensory Room" }),
    ]);
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.queryByText("Sensory Room")).toBeNull();
  });

  it("says when a room is staff-only, since families never see it", () => {
    // The room record knows this; the settings blob doesn't. Ticking
    // "enabled" on a staff-only room does nothing, and the coordinator
    // deserves to know that before waiting for bookings.
    const qc = makeClient([room({ staffOnly: true })]);
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.getByText(/families won't see this/i)).toBeDefined();
  });

  it("names an archived tier the room is still linked to", () => {
    // Dropping it from the picker blanks the select, and the next save
    // silently unlinks a live price.
    const qc = makeClient([
      room({
        fees: [{ id: "f-new", name: "Full session", amountCents: 4500 }],
        archivedFees: [{ id: "f-old", name: "2025 rate", amountCents: 4000 }],
      }),
    ]);
    render(
      <ServiceCasualBookingsTab
        service={makeService({
          casualBookingSettings: {
            bsc: {
              enabled: true,
              fee: 40,
              spots: 5,
              cutOffHours: 24,
              days: ["mon"],
              feeTierId: "f-old",
            },
          },
        })}
      />,
      { wrapper: makeWrapper(qc) },
    );

    expect(screen.getByText(/2025 rate — archived/i)).toBeDefined();
  });

  it("renders nothing rather than guessing while the rooms are still loading", () => {
    // An empty cache, not an empty centre. Inventing the three core
    // programmes here would show a coordinator cards that may not match
    // their rooms, and they'd start typing into them.
    const qc = makeClient([]);
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    expect(screen.queryByTestId("casual-card-bsc")).toBeNull();
  });
});
