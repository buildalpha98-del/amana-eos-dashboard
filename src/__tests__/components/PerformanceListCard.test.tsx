// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "@/lib/fetch-api";
import { PerformanceListCard } from "@/components/leadership/PerformanceListCard";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockedFetch = vi.mocked(fetchApi);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PerformanceListCard", () => {
  it("renders empty placeholder when API returns no rows", async () => {
    mockedFetch.mockResolvedValue([]);
    render(<PerformanceListCard />, { wrapper });
    expect(
      await screen.findByText(/no performance data yet/i),
    ).toBeInTheDocument();
  });

  it("renders rows with role badge, completion bar, and centre count", async () => {
    mockedFetch.mockResolvedValue([
      {
        id: "u-1",
        name: "Alice Adams",
        email: "alice@example.com",
        role: "admin",
        avatar: null,
        service: { id: "svc-1", name: "Mawson Lakes" },
        activeRocks: 3,
        totalTodos: 10,
        completedTodos: 7,
        todoCompletionPct: 70,
        openIssues: 0,
        managedServices: 2,
        rocks: [],
      },
    ]);
    render(<PerformanceListCard />, { wrapper });
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText(/Clear/)).toBeInTheDocument();
  });

  it("link each row to /staff/[id]", async () => {
    mockedFetch.mockResolvedValue([
      {
        id: "u-99",
        name: "Bob Brown",
        email: "bob@example.com",
        role: "staff",
        avatar: null,
        service: null,
        activeRocks: 0,
        totalTodos: 0,
        completedTodos: 0,
        todoCompletionPct: 0,
        openIssues: 2,
        managedServices: 0,
        rocks: [],
      },
    ]);
    render(<PerformanceListCard />, { wrapper });
    const link = await screen.findByTestId("performance-row-link");
    expect(link).toHaveAttribute("href", "/staff/u-99");
  });

  it("shows error message on fetch failure", async () => {
    mockedFetch.mockRejectedValue(new Error("boom"));
    render(<PerformanceListCard />, { wrapper });
    // useTeam has retry: 2 which delays the error state, so bump the
    // findBy timeout above its default 1s.
    expect(
      await screen.findByText(/failed to load performance metrics/i, undefined, {
        timeout: 7000,
      }),
    ).toBeInTheDocument();
  }, 10_000);
});
