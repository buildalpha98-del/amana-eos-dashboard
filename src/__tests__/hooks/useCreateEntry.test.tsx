// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useCreateEntry, type ScorecardData } from "@/hooks/useScorecard";

function buildScorecard(
  overrides: Partial<ScorecardData["measurables"][number]> = {},
): ScorecardData {
  return {
    id: "sc-1",
    title: "Leadership Scorecard",
    measurables: [
      {
        id: "m-1",
        title: "Customer Satisfaction",
        description: null,
        ownerId: "u-1",
        owner: {
          id: "u-1",
          name: "Sarah Johnson",
          email: "sarah@example.com",
          avatar: null,
        },
        goalValue: 90,
        goalDirection: "above",
        unit: "%",
        frequency: "weekly",
        rockId: null,
        rock: null,
        serviceId: null,
        service: null,
        entries: [],
        ...overrides,
      },
    ],
  };
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useCreateEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically writes the entry into BOTH scorecard and scorecard-detail caches", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(["scorecard"], buildScorecard());
    qc.setQueryData(["scorecard-detail", "sc-1"], buildScorecard());

    // Hold the mutation in-flight so we can inspect the optimistic state
    // before the API resolves.
    let resolveFetch: (val: unknown) => void = () => {};
    vi.mocked(mutateApi).mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      }),
    );

    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        measurableId: "m-1",
        weekOf: "2026-05-11T00:00:00.000Z",
        value: 95,
      });
    });

    // Optimistic write should be visible on both caches.
    await waitFor(() => {
      const legacy = qc.getQueryData<ScorecardData>(["scorecard"]);
      const detail = qc.getQueryData<ScorecardData>([
        "scorecard-detail",
        "sc-1",
      ]);
      expect(legacy?.measurables[0].entries).toHaveLength(1);
      expect(legacy?.measurables[0].entries[0].value).toBe(95);
      expect(legacy?.measurables[0].entries[0].onTrack).toBe(true); // 95 >= 90
      expect(detail?.measurables[0].entries).toHaveLength(1);
      expect(detail?.measurables[0].entries[0].value).toBe(95);
    });

    // Resolve so the test exits cleanly.
    resolveFetch({});
  });

  it("rolls back BOTH caches when the mutation fails", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(["scorecard"], buildScorecard());
    qc.setQueryData(["scorecard-detail", "sc-1"], buildScorecard());

    vi.mocked(mutateApi).mockRejectedValue(new Error("Server exploded"));

    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          measurableId: "m-1",
          weekOf: "2026-05-11T00:00:00.000Z",
          value: 95,
        });
      } catch {
        // expected
      }
    });

    const legacy = qc.getQueryData<ScorecardData>(["scorecard"]);
    const detail = qc.getQueryData<ScorecardData>(["scorecard-detail", "sc-1"]);
    // Both caches should be restored to their pre-mutation state.
    expect(legacy?.measurables[0].entries).toHaveLength(0);
    expect(detail?.measurables[0].entries).toHaveLength(0);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Server exploded",
      }),
    );
  });

  it("invalidates scorecard-detail (not just legacy scorecard) so the UI refetches", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(["scorecard"], buildScorecard());
    qc.setQueryData(["scorecard-detail", "sc-1"], buildScorecard());

    vi.mocked(mutateApi).mockResolvedValue({});
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        measurableId: "m-1",
        weekOf: "2026-05-11T00:00:00.000Z",
        value: 95,
      });
    });

    // The settle call uses a predicate, not a fixed queryKey — verify
    // it matches both the legacy and detail caches by exercising the
    // predicate function passed in.
    const calls = invalidateSpy.mock.calls.filter((c) =>
      typeof c[0] === "object" && c[0] !== null && "predicate" in c[0],
    );
    expect(calls.length).toBeGreaterThan(0);
    const predicate = (calls[0][0] as { predicate: (q: { queryKey: readonly unknown[] }) => boolean }).predicate;
    expect(predicate({ queryKey: ["scorecard"] })).toBe(true);
    expect(predicate({ queryKey: ["scorecard-detail", "sc-1"] })).toBe(true);
    expect(predicate({ queryKey: ["service-scorecard", "svc-1"] })).toBe(true);
    expect(predicate({ queryKey: ["scorecard-rollup"] })).toBe(true);
    // Unrelated keys must NOT match — invalidating them would refetch
    // half the dashboard on every cell edit.
    expect(predicate({ queryKey: ["leadership-overview"] })).toBe(false);
    expect(predicate({ queryKey: ["users"] })).toBe(false);
  });

  it("updates an existing entry in place when one already exists for the same week", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const scWithEntry = buildScorecard({
      entries: [
        {
          id: "e-1",
          measurableId: "m-1",
          weekOf: "2026-05-11T00:00:00.000Z",
          value: 80,
          onTrack: false,
          notes: null,
          enteredBy: { id: "u-1", name: "Sarah" },
          createdAt: "2026-05-11T01:00:00.000Z",
        },
      ],
    });
    qc.setQueryData(["scorecard-detail", "sc-1"], scWithEntry);

    let resolveFetch: (val: unknown) => void = () => {};
    vi.mocked(mutateApi).mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      }),
    );

    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        measurableId: "m-1",
        weekOf: "2026-05-11T00:00:00.000Z",
        value: 95,
      });
    });

    await waitFor(() => {
      const detail = qc.getQueryData<ScorecardData>([
        "scorecard-detail",
        "sc-1",
      ]);
      const entries = detail?.measurables[0].entries ?? [];
      expect(entries).toHaveLength(1); // no duplicate
      expect(entries[0].id).toBe("e-1"); // same row, edited
      expect(entries[0].value).toBe(95);
      expect(entries[0].onTrack).toBe(true);
    });

    resolveFetch({});
  });
});
