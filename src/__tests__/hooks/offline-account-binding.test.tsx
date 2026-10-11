// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ userId: "u1", mutate: vi.fn(), enqueue: vi.fn(async () => {}) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.userId ? { user: { id: state.userId } } : null }) }));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: state.mutate, fetchApi: vi.fn() }));
vi.mock("@/lib/offline-queue", () => ({ offlineQueue: { enqueue: state.enqueue } }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));
import { useLogDose } from "@/hooks/useMedications";

const body = { childId: "c1", medicationName: "Synthetic dose", dose: "Test only", route: "oral" as const, administeredAt: "2026-10-12T04:00:00Z", clientMutationId: "m1" };
beforeEach(() => { vi.clearAllMocks(); state.userId = "u1"; });

it("keeps the originating account when the device changes account during a failed save", async () => {
  let rejectSave!: (error: Error) => void;
  state.mutate.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(() => useLogDose("s1"), { wrapper });
  let pending!: Promise<unknown>;
  await act(async () => { pending = result.current.mutateAsync(body); });
  expect(state.mutate).toHaveBeenCalledWith("/api/services/s1/medications", expect.objectContaining({ headers: { "x-amana-action-user": "u1" } }));
  state.userId = "u2";
  rerender();
  await act(async () => { rejectSave(new Error("Failed to fetch")); await pending; });
  expect(state.enqueue).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "u1", body }));
  client.clear();
});

it("does not send or queue work without a known originating account", async () => {
  state.userId = "";
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useLogDose("s1"), { wrapper });
  await act(async () => { await expect(result.current.mutateAsync(body)).rejects.toThrow("sign in"); });
  expect(state.mutate).not.toHaveBeenCalled();
  expect(state.enqueue).not.toHaveBeenCalled();
  client.clear();
});
