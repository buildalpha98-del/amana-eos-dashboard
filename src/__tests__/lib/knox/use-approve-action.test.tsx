// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn(), mutateApi: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "authenticated" }) }));

import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useApproveAction, useDismissAction } from "@/hooks/useKnox";

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

const invalidatedKeys = (spy: ReturnType<typeof setup>["spy"]) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe("useApproveAction", () => {
  beforeEach(() => {
    vi.mocked(mutateApi).mockReset();
    vi.mocked(toast).mockReset();
  });

  it("invalidates Knox and every register list the approved change touches", async () => {
    vi.mocked(mutateApi).mockImplementation(async (url: string) => {
      if (url === "/api/knox/actions/pa1/approve") return { resultId: "r1", jobId: null };
      throw new Error(`unexpected ${url}`);
    });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useApproveAction(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "pa1", serviceId: "svc1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mutateApi).toHaveBeenCalledWith("/api/knox/actions/pa1/approve", { method: "POST" });
    const keys = invalidatedKeys(spy);
    for (const expected of [
      ["knox"],
      ["incidents"],
      ["incidents-summary"],
      ["incidents-trends"],
      ["compliance", "complaints"],
      ["service", "svc1", "staff-incidents"],
    ]) {
      expect(keys).toContainEqual(expected);
    }
  });

  it("falls back to the service prefix when the card has no service", async () => {
    vi.mocked(mutateApi).mockImplementation(async () => ({ resultId: "r1", jobId: null }));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useApproveAction(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: "pa2", serviceId: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(spy)).toContainEqual(["service"]);
  });

  it("does not invalidate register lists when approval fails, and toasts the error", async () => {
    vi.mocked(mutateApi).mockImplementation(async () => {
      throw new Error("This card has expired");
    });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useApproveAction(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: "pa3", serviceId: "svc1" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", description: "This card has expired" });
  });
});

describe("useDismissAction", () => {
  it("only refreshes Knox — dismissing changes no record", async () => {
    vi.mocked(mutateApi).mockImplementation(async () => ({ ok: true }));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useDismissAction(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: "pa4", reason: " not needed " });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mutateApi).toHaveBeenCalledWith("/api/knox/actions/pa4/dismiss", {
      method: "POST",
      body: { reason: "not needed" },
    });
    expect(invalidatedKeys(spy)).toEqual([["knox"]]);
  });
});
