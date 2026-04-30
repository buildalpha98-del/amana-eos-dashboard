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

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
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

  it("renders the info banner explaining settings-only scope", () => {
    const qc = makeClient();
    render(<ServiceCasualBookingsTab service={makeService()} />, {
      wrapper: makeWrapper(qc),
    });

    // Headline ("Settings stored — not yet enforced") + the body copy below
    // both mention "not yet enforced" — use getAllByText and assert ≥1.
    expect(screen.getAllByText(/not yet enforced/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/follow-up sub-project/i),
    ).toBeDefined();
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
        /Parents can book casual BSC up to 24 hours before the session at \$36\.00 \(10 spots available\)\./i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /Parents can book casual ASC up to 12 hours before the session at \$42\.00 \(8 spots available\)\./i,
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
