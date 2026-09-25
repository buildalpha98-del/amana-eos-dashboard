// @vitest-environment jsdom
import React from "react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(() =>
    Promise.resolve({ data: {}, currentStep: 0, submittedAt: null, updatedAt: null }),
  ),
  mutateApi: vi.fn(),
}));

import { mutateApi } from "@/lib/fetch-api";
import { useEnrolmentDraft } from "@/hooks/useEnrolmentDraft";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useEnrolmentDraft — flush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the pending edit when the save fails, so a later flush still sends it", async () => {
    // Regression (2026-09-23): flush() used to clear the pending payload
    // BEFORE the network call, so a save that failed right as a parent
    // hit Submit on the last step silently dropped that final edit —
    // the server then re-validated an incomplete draft and rejected the
    // submission with a confusing "please finish the X step" error for a
    // step that looked done on screen.
    const mocked = vi.mocked(mutateApi);
    mocked.mockRejectedValueOnce(new Error("network down"));
    mocked.mockResolvedValueOnce(undefined);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEnrolmentDraft(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.save({ agreement: { termsAccepted: true } }, 4);
    });

    // First flush fails — swallowed by default (no throwOnError).
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.saveState).toBe("error");
    expect(mocked).toHaveBeenCalledTimes(1);

    // A second flush (e.g. the submit-time retry) still has the payload
    // to send, and this time it succeeds.
    await act(async () => {
      await result.current.flush();
    });
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked.mock.calls[1][1]).toMatchObject({
      body: { data: { agreement: { termsAccepted: true } }, currentStep: 4 },
    });
    expect(result.current.saveState).toBe("saved");
  });

  it("throws when throwOnError is passed, so the caller can react to the failure", async () => {
    const mocked = vi.mocked(mutateApi);
    mocked.mockRejectedValueOnce(new Error("network down"));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEnrolmentDraft(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.save({ me: { firstName: "Amina" } }, 0);
    });

    await expect(
      act(async () => {
        await result.current.flush({ throwOnError: true });
      }),
    ).rejects.toThrow("network down");
  });

  it("does nothing when there is no pending edit", async () => {
    const mocked = vi.mocked(mutateApi);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEnrolmentDraft(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.flush();
    });
    expect(mocked).not.toHaveBeenCalled();
  });
});
