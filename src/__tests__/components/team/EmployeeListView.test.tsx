/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EmployeeListView,
  parseFiltersFromUrl,
} from "@/components/team/EmployeeListView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));
import { fetchApi } from "@/lib/fetch-api";
const mockedFetch = vi.mocked(fetchApi);

vi.mock("@/components/settings/BulkInviteModal", () => ({
  BulkInviteModal: () => <div data-testid="bulk-invite-modal" />,
}));

const SERVICES = [{ id: "svc-1", name: "Mawson Lakes" }];

const ALICE = {
  id: "u-1",
  name: "Alice Adams",
  email: "alice@example.com",
  avatar: null,
  phone: "0400000001",
  role: "staff",
  service: { id: "svc-1", name: "Mawson Lakes" },
  status: "active" as const,
  tags: [] as string[],
};

function renderWithQuery(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("parseFiltersFromUrl", () => {
  it("returns sane defaults from an empty URLSearchParams", () => {
    const out = parseFiltersFromUrl(new URLSearchParams());
    expect(out).toEqual({
      q: "",
      status: null,
      serviceIds: [],
      roles: [],
      tags: [],
      sort: "name",
      page: 1,
    });
  });

  it("parses all params including comma-separated multi-select", () => {
    const out = parseFiltersFromUrl(
      new URLSearchParams("q=ali&status=active&s=svc-1,svc-2&r=staff&sort=role&page=3"),
    );
    expect(out.q).toBe("ali");
    expect(out.status).toBe("active");
    expect(out.serviceIds).toEqual(["svc-1", "svc-2"]);
    expect(out.roles).toEqual(["staff"]);
    expect(out.sort).toBe("role");
    expect(out.page).toBe(3);
  });

  it("rejects invalid status / sort / page values gracefully", () => {
    const out = parseFiltersFromUrl(
      new URLSearchParams("status=hacked&sort=password&page=-5"),
    );
    expect(out.status).toBe(null);
    expect(out.sort).toBe("name");
    expect(out.page).toBe(1);
  });
});

describe("EmployeeListView", () => {
  it("renders skeleton when loading", () => {
    mockedFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithQuery(
      <EmployeeListView viewerRole="admin" viewerId="viewer-1" services={SERVICES} />,
    );
    // Skeleton rows have role row but no actual employee rows
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("renders rows when data loads", async () => {
    mockedFetch.mockResolvedValue({
      employees: [ALICE],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
        pendingCount: 0,
    });
    renderWithQuery(
      <EmployeeListView viewerRole="admin" viewerId="viewer-1" services={SERVICES} />,
    );
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();
  });

  it("renders 'No matches' when filters return zero results", async () => {
    // Mock a URL with filters and an empty result
    const useSearchParamsMock = await vi.importMock<
      typeof import("next/navigation")
    >("next/navigation");
    (
      useSearchParamsMock as { useSearchParams: () => URLSearchParams }
    ).useSearchParams = () => new URLSearchParams("q=zzz");
    mockedFetch.mockResolvedValue({
      employees: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 1,
        pendingCount: 0,
    });
    renderWithQuery(
      <EmployeeListView viewerRole="admin" viewerId="viewer-1" services={SERVICES} />,
    );
    expect(await screen.findByText(/No matches|No employees yet/)).toBeInTheDocument();
  });

  it("hides Add Employee + Export CSV buttons for non-admin viewers", async () => {
    mockedFetch.mockResolvedValue({
      employees: [ALICE],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
        pendingCount: 0,
    });
    renderWithQuery(
      <EmployeeListView viewerRole="member" viewerId="viewer-1" services={SERVICES} />,
    );
    await screen.findByText("Alice Adams");
    expect(screen.queryByRole("button", { name: /Invite Employees/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export CSV/i })).toBeNull();
  });

  it("renders Invite Employees button for admin viewer", async () => {
    mockedFetch.mockResolvedValue({
      employees: [ALICE],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
        pendingCount: 0,
    });
    renderWithQuery(
      <EmployeeListView viewerRole="admin" viewerId="viewer-1" services={SERVICES} />,
    );
    await screen.findByText("Alice Adams");
    expect(
      screen.getByRole("button", { name: /Invite Employees/i }),
    ).toBeInTheDocument();
  });
});
