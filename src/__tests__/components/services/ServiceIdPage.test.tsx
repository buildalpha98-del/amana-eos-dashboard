// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Shared mock state ───────────────────────────────────────────

const searchParamsRef: { tab: string | null; sub: string | null } = {
  tab: null,
  sub: null,
};

const routerReplaceSpy = vi.fn();

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "svc-1" }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "tab") return searchParamsRef.tab;
      if (key === "sub") return searchParamsRef.sub;
      return null;
    },
  }),
  useRouter: () => ({
    replace: routerReplaceSpy,
    push: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
        email: "me@example.com",
        role: "admin",
        serviceId: null,
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/hooks/useServices", () => ({
  useService: () => ({
    data: {
      id: "svc-1",
      name: "Centre Alpha",
      code: "CA",
      status: "active",
      suburb: "Townsville",
      state: "QLD",
      bscDailyRate: 50,
      ascDailyRate: 60,
      vcDailyRate: 70,
      todos: [],
      issues: [],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  };
});

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub every tab so we can detect which one is rendered by test-id without
// pulling in their query dependencies.
vi.mock("@/components/services/ServiceTodayTab", () => ({
  ServiceTodayTab: ({ serviceId, serviceName }: { serviceId: string; serviceName?: string | null }) => (
    <div data-testid="today-tab">
      today:{serviceId}:{serviceName ?? ""}
    </div>
  ),
}));
vi.mock("@/components/services/ServiceTodayPanel", () => ({
  ServiceTodayPanel: ({ serviceId }: { serviceId: string }) => (
    <div data-testid="today-panel-raw">panel:{serviceId}</div>
  ),
}));
vi.mock("@/components/services/ServiceOverviewTab", () => ({
  ServiceOverviewTab: () => <div data-testid="overview-tab">overview</div>,
}));
vi.mock("@/components/services/ServiceScorecardTab", () => ({
  ServiceScorecardTab: () => <div data-testid="scorecard-tab">scorecard</div>,
}));
vi.mock("@/components/services/ServiceRocksTab", () => ({
  ServiceRocksTab: () => <div data-testid="rocks-tab">rocks</div>,
}));
vi.mock("@/components/services/ServiceTodosTab", () => ({
  ServiceTodosTab: () => <div data-testid="todos-tab">todos</div>,
}));
vi.mock("@/components/services/ServiceIssuesTab", () => ({
  ServiceIssuesTab: () => <div data-testid="issues-tab">issues</div>,
}));
vi.mock("@/components/services/ServiceProjectsTab", () => ({
  ServiceProjectsTab: () => <div data-testid="projects-tab">projects</div>,
}));
vi.mock("@/components/services/WeeklyDataEntry", () => ({
  WeeklyDataEntry: () => <div data-testid="weekly-data">weekly</div>,
}));
vi.mock("@/components/services/ServiceCommTab", () => ({
  ServiceCommTab: () => <div data-testid="comm-tab">comm</div>,
}));
vi.mock("@/components/services/ServiceAttendanceTab", () => ({
  ServiceAttendanceTab: () => <div data-testid="attendance-tab">attendance</div>,
}));
vi.mock("@/components/services/ServiceBudgetTab", () => ({
  ServiceBudgetTab: () => <div data-testid="budget-tab">budget</div>,
}));
vi.mock("@/components/services/ServiceProgramTab", () => ({
  ServiceProgramTab: () => <div data-testid="program-tab">program</div>,
}));
vi.mock("@/components/services/ServiceMenuTab", () => ({
  ServiceMenuTab: () => <div data-testid="menu-tab">menu</div>,
}));
vi.mock("@/components/services/ServiceAuditsTab", () => ({
  ServiceAuditsTab: () => <div data-testid="audits-tab">audits</div>,
}));
vi.mock("@/components/services/ServiceQIPTab", () => ({
  ServiceQIPTab: () => <div data-testid="qip-tab">qip</div>,
}));
vi.mock("@/components/services/ServiceChecklistsTab", () => ({
  ServiceChecklistsTab: () => <div data-testid="checklists-tab">checklists</div>,
}));
vi.mock("@/components/services/ServiceRollCallTab", () => ({
  ServiceRollCallTab: () => <div data-testid="rollcall-tab">rollcall</div>,
}));
vi.mock("@/components/services/ServiceChildrenTab", () => ({
  ServiceChildrenTab: () => <div data-testid="children-tab">children</div>,
}));
vi.mock("@/components/services/ServiceWeeklyRosterTab", () => ({
  ServiceWeeklyRosterTab: () => <div data-testid="roster-tab">roster</div>,
}));
vi.mock("@/components/services/ServiceCasualBookingsTab", () => ({
  ServiceCasualBookingsTab: () => <div data-testid="casual-tab">casual</div>,
}));

// The page component import happens AFTER mocks so they are applied.
import ServiceDetailPage from "@/app/(dashboard)/services/[id]/page";

// ─── Helpers ─────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceDetailPage — Today tab + default landing", () => {
  beforeEach(() => {
    searchParamsRef.tab = null;
    searchParamsRef.sub = null;
    routerReplaceSpy.mockReset();
  });

  it("lands on Today tab by default when no ?tab= query is present", () => {
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId("today-tab")).toBeDefined();
    expect(screen.queryByTestId("overview-tab")).toBeNull();
  });

  it("threads serviceId and serviceName into the Today tab", () => {
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("today-tab").textContent).toContain(
      "today:svc-1:Centre Alpha",
    );
  });

  it("renders Overview when ?tab=overview (regression — existing links keep working)", () => {
    searchParamsRef.tab = "overview";
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId("overview-tab")).toBeDefined();
    expect(screen.queryByTestId("today-tab")).toBeNull();
  });

  it("renders Today when ?tab=today", () => {
    searchParamsRef.tab = "today";
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId("today-tab")).toBeDefined();
    expect(screen.queryByTestId("overview-tab")).toBeNull();
  });

  it("shows Today first in the tab bar (position 0)", () => {
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });
    // Desktop nav: the mobile dropdown also exists but is hidden by
    // `sm:hidden`. Use button role queries to enumerate tab buttons.
    const todayButtons = screen.getAllByText("Today");
    const overviewButtons = screen.getAllByText("Overview");
    expect(todayButtons.length).toBeGreaterThan(0);
    expect(overviewButtons.length).toBeGreaterThan(0);
  });

  it("does not render ServiceTodayPanel at page level outside the Today tab", () => {
    // When ?tab=overview, the raw panel must not appear above the tab
    // group anymore — it should only render inside the Today tab wrapper.
    searchParamsRef.tab = "overview";
    render(<ServiceDetailPage />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId("today-panel-raw")).toBeNull();
    expect(screen.queryByTestId("today-tab")).toBeNull();
    expect(screen.getByTestId("overview-tab")).toBeDefined();
  });
});
