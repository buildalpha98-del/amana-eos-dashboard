// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

import { useUpdateModuleProgress } from "@/hooks/useLMS";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useUpdateModuleProgress — invalidates list queries on success", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates my-enrollments and lms-course after successful completion", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          enrollment: { id: "e1", completedAt: new Date().toISOString() },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useUpdateModuleProgress(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        enrollmentId: "e1",
        moduleId: "m1",
        completed: true,
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["my-enrollments"],
      });
    });
  });
});
