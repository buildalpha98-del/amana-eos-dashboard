// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "@/lib/fetch-api";
import { useLeadershipOverview } from "@/hooks/useLeadership";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useLeadershipOverview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches from /api/leadership/overview", async () => {
    vi.mocked(fetchApi).mockResolvedValue({
      staffCount: 10,
      serviceCount: 3,
      openIssueCount: 0,
      openTicketCount: 0,
      rocksRollup: { quarter: "Q2-2026", total: 0, onTrack: 0, offTrack: 0, complete: 0, dropped: 0, byService: [] },
      sentimentTrend: [],
    });
    const { result } = renderHook(() => useLeadershipOverview(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetchApi).toHaveBeenCalledWith("/api/leadership/overview");
    expect(result.current.data?.staffCount).toBe(10);
  });
});
