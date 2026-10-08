// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Avoid network calls from sub-components that fetch (feedback / staffing / waitlist / enrolled).
vi.mock("@/hooks/useStaffing", () => ({
  useServiceStaffing: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/hooks/useWaitlist", () => ({
  useWaitlist: () => ({ data: { total: 0, entries: [] } }),
  useOfferSpot: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn().mockResolvedValue({}),
  mutateApi: vi.fn().mockResolvedValue({}),
}));

// Stub next/navigation so useRouter doesn't crash outside an app router shell.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ServiceOverviewTab } from "@/components/services/ServiceOverviewTab";

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

// Minimal Service fixture with only the fields ServiceOverviewTab reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeService(overrides: Record<string, unknown> = {}): any {
  return {
    id: "svc-1",
    name: "Centre Alpha",
    code: "CA",
    status: "active",
    address: null,
    suburb: null,
    state: null,
    postcode: null,
    phone: null,
    email: null,
    capacity: null,
    operatingDays: null,
    notes: null,
    managerId: null,
    manager: null,
    bscDailyRate: null,
    ascDailyRate: null,
    vcDailyRate: null,
    bscCasualRate: 0,
    ascCasualRate: 0,
    bscGroceryRate: 0,
    ascGroceryRate: 0,
    vcGroceryRate: 0,
    projects: [],
    serviceApprovalNumber: null,
    providerApprovalNumber: null,
    sessionTimes: null,
    _count: { rocks: 0, issues: 0, todos: 0, projects: 0 },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

// 2026-10-08: Service Info became an OWNA-style tabbed panel; approvals
// moved into the Centre details form (always-editable for editors).
const mutateSpy = vi.fn();
vi.mock("@/hooks/useServices", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useServices")>()),
  useUpdateService: () => ({ mutate: mutateSpy, isPending: false }),
  useDeleteService: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderTab(service = makeService()) {
  return render(<ServiceOverviewTab service={service} users={[]} />, {
    wrapper: makeWrapper(makeClient()),
  });
}

describe("ServiceOverviewTab — Centre details form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
  });

  it("opens on Centre details with the approval numbers in their fields", () => {
    renderTab(makeService({ serviceApprovalNumber: "SE-123", providerApprovalNumber: "PR-9" }));
    expect((screen.getByLabelText(/Service approval number/i) as HTMLInputElement).value).toBe("SE-123");
    expect((screen.getByLabelText(/Provider approval number/i) as HTMLInputElement).value).toBe("PR-9");
  });

  it("every field explains where it's used", () => {
    renderTab();
    expect(screen.getByText(/Shown to families on their enrolment confirmation/i)).toBeTruthy();
    expect(screen.getByText(/becomes the centre's own account/i)).toBeTruthy();
  });

  it("saves only the fields that changed", () => {
    renderTab(makeService({ phone: "0400 000 000" }));
    const phone = screen.getByLabelText(/^Phone/i) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "0411 111 111" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(mutateSpy).toHaveBeenCalledWith({ id: "svc-1", phone: "0411 111 111" });
  });

  it("admins can edit everything, including status", () => {
    renderTab();
    expect((screen.getByLabelText(/Centre name/i) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText(/^Status/i) as HTMLSelectElement).disabled).toBe(false);
  });

  it("a coordinator edits their own centre — but not its status", () => {
    sessionRef.role = "member";
    sessionRef.serviceId = "svc-1";
    renderTab();
    expect((screen.getByLabelText(/Centre name/i) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText(/^Status/i) as HTMLSelectElement).disabled).toBe(true);
  });

  it("read-only for staff and other centres' coordinators", () => {
    sessionRef.role = "staff";
    renderTab();
    expect((screen.getByLabelText(/Centre name/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
  });

  it("other sections sit on their own tabs", () => {
    renderTab();
    for (const t of ["Session times", "Capacity & rates", "Staffing", "School partnership", "Family feedback"]) {
      expect(screen.getByRole("button", { name: t })).toBeTruthy();
    }
    expect(screen.queryByText(/Active Rocks/i)).toBeNull();
  });
});
