/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "@/lib/fetch-api";
import { useEmployeesList } from "@/hooks/useEmployeesList";

const mockedFetch = vi.mocked(fetchApi);

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue({
    employees: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
});

describe("useEmployeesList", () => {
  it("calls /api/employees with default params when none passed", async () => {
    renderHook(() => useEmployeesList({}), { wrapper: wrap() });
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const url = mockedFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/employees?");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=50");
    expect(url).toContain("sort=name");
  });

  it("translates filter params to URL with short codes (s=, r=)", async () => {
    renderHook(
      () =>
        useEmployeesList({
          q: "ali",
          status: "active",
          serviceIds: ["svc-1", "svc-2"],
          roles: ["staff", "member"],
          sort: "role",
          page: 2,
          pageSize: 25,
        }),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const url = mockedFetch.mock.calls[0][0] as string;
    expect(url).toContain("q=ali");
    expect(url).toContain("status=active");
    expect(url).toContain("s=svc-1%2Csvc-2");
    expect(url).toContain("r=staff%2Cmember");
    expect(url).toContain("sort=role");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=25");
  });

  it("returns the unwrapped employees + pagination shape", async () => {
    mockedFetch.mockResolvedValueOnce({
      employees: [
        {
          id: "u-1",
          name: "Alice",
          email: "a@a.test",
          avatar: null,
          phone: null,
          role: "staff",
          service: { id: "svc-1", name: "Mawson" },
          status: "active",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    const { result } = renderHook(() => useEmployeesList({}), {
      wrapper: wrap(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.employees).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.employees[0].name).toBe("Alice");
  });
});
