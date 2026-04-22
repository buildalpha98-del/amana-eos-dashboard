// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

describe("ServiceOverviewTab — approvals & session times card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRef.role = "admin";
    sessionRef.serviceId = null;
  });

  function getApprovalsCard(): HTMLElement {
    const heading = screen.getByText(/Service Approvals & Session Times/i);
    // Walk up to the ApprovalsSessionTimesCard outer wrapper (the nearest
    // ancestor that contains *both* the heading and the approvals display card).
    let node: HTMLElement | null = heading as HTMLElement;
    while (node) {
      const textContent = node.textContent ?? "";
      if (
        textContent.includes("Service Approval #") &&
        textContent.includes("Provider Approval #")
      ) {
        return node;
      }
      node = node.parentElement;
    }
    throw new Error("Approvals card not found");
  }

  it("renders approval numbers and session-time rows when populated", () => {
    const service = makeService({
      serviceApprovalNumber: "SE-00012345",
      providerApprovalNumber: "PR-00067890",
      sessionTimes: {
        bsc: { start: "06:30", end: "08:45" },
        asc: { start: "15:00", end: "18:00" },
      },
    });

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const card = getApprovalsCard();

    // Approval numbers
    expect(within(card).getByText("SE-00012345")).toBeDefined();
    expect(within(card).getByText("PR-00067890")).toBeDefined();

    // Session rows — use uppercase codes and em-dash.
    // BSC label and times appear as separate DOM nodes — check both exist in
    // the card scoped, and that the card's text content has the full row.
    expect(within(card).getByText(/06:30\s+–\s+08:45/)).toBeDefined();
    expect(within(card).getByText(/15:00\s+–\s+18:00/)).toBeDefined();
    // There should be exactly 2 time rows (BSC + ASC) — VC unpopulated ⇒ not rendered.
    expect(
      within(card).getAllByText(/\d{2}:\d{2}\s+–\s+\d{2}:\d{2}/),
    ).toHaveLength(2);
  });

  it("shows em-dash placeholders when approval numbers are unpopulated", () => {
    const service = makeService();

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const card = getApprovalsCard();

    // Both approval fields display the em-dash placeholder.
    const dashes = within(card).getAllByText("—");
    expect(dashes.length).toBe(2);

    // Session times section not rendered → no en-dash time range anywhere in the card.
    expect(within(card).queryByText(/\d{2}:\d{2}\s+–\s+\d{2}:\d{2}/)).toBeNull();
  });

  it("hides the session-times list entirely when sessionTimes is null", () => {
    const service = makeService({ sessionTimes: null });

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    // No session row should render
    expect(screen.queryByText(/BSC\s+\d{2}:\d{2}/)).toBeNull();
    expect(screen.queryByText(/ASC\s+\d{2}:\d{2}/)).toBeNull();
    expect(screen.queryByText(/VC\s+\d{2}:\d{2}/)).toBeNull();
  });

  it("shows Edit button for admin users", () => {
    sessionRef.role = "admin";
    const service = makeService();

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const heading = screen.getByText(/Service Approvals & Session Times/i);
    const card = heading.closest("div");
    expect(card).toBeTruthy();
    const editBtn = within(card as HTMLElement).getByRole("button", {
      name: /edit approvals/i,
    });
    expect(editBtn).toBeDefined();
  });

  it("hides Edit button for staff users", () => {
    sessionRef.role = "staff";
    const service = makeService();

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const heading = screen.getByText(/Service Approvals & Session Times/i);
    const card = heading.closest("div");
    expect(card).toBeTruthy();
    const editBtn = within(card as HTMLElement).queryByRole("button", {
      name: /edit approvals/i,
    });
    expect(editBtn).toBeNull();
  });

  it("shows Edit button for coordinator of the same service", () => {
    sessionRef.role = "coordinator";
    sessionRef.serviceId = "svc-1";
    const service = makeService();

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const heading = screen.getByText(/Service Approvals & Session Times/i);
    const card = heading.closest("div");
    expect(card).toBeTruthy();
    const editBtn = within(card as HTMLElement).getByRole("button", {
      name: /edit approvals/i,
    });
    expect(editBtn).toBeDefined();
  });

  it("hides Edit button for coordinator of another service", () => {
    sessionRef.role = "coordinator";
    sessionRef.serviceId = "svc-other";
    const service = makeService();

    const qc = makeClient();
    render(<ServiceOverviewTab service={service} users={[]} />, {
      wrapper: makeWrapper(qc),
    });

    const heading = screen.getByText(/Service Approvals & Session Times/i);
    const card = heading.closest("div");
    expect(card).toBeTruthy();
    const editBtn = within(card as HTMLElement).queryByRole("button", {
      name: /edit approvals/i,
    });
    expect(editBtn).toBeNull();
  });
});
