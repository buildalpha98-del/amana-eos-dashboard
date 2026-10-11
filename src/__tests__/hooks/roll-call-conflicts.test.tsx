// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  enqueue: vi.fn(),
  all: vi.fn(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } } }),
}));
vi.mock("@/lib/fetch-api", () => ({
  mutateApi: state.mutate,
  fetchApi: vi.fn(),
}));
vi.mock("@/lib/offline-queue", () => ({
  offlineQueue: { enqueue: state.enqueue, all: state.all },
}));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));
import { useUpdateRollCall } from "@/hooks/useRollCall";

const body = {
  childId: "c1",
  serviceId: "s1",
  date: "2026-10-12",
  sessionType: "asc",
  action: "sign_in" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.all.mockResolvedValue([]);
  state.enqueue.mockResolvedValue(undefined);
  state.mutate.mockResolvedValue({});
});

function setup(recordRevision: string | null | undefined) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(["roll-call", "s1", body.date, "asc"], {
    records: [{ childId: "c1", status: "booked", recordRevision }],
    summary: { total: 1, present: 0, absent: 0, notMarked: 1 },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useUpdateRollCall(), { wrapper }), client };
}

it("sends the original baseline despite optimistic arrival rendering", async () => {
  const { result, client } = setup(null);
  await act(async () => {
    await result.current.mutateAsync(body);
  });
  expect(state.mutate).toHaveBeenCalledWith(
    "/api/attendance/roll-call",
    expect.objectContaining({
      body: expect.objectContaining({
        expectedRevision: null,
        clientMutationId: expect.any(String),
      }),
      headers: { "x-amana-action-user": "u1" },
    }),
  );
  expect(state.enqueue).not.toHaveBeenCalled();
  client.clear();
});

it("retains the viewed revision and original request when a save goes offline", async () => {
  const { result, client } = setup("a".repeat(64));
  state.mutate.mockRejectedValue(new Error("Failed to fetch"));
  await act(async () => {
    await result.current.mutateAsync(body);
  });
  const sent = state.mutate.mock.calls[0][1].body;
  expect(state.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerId: "u1",
      id: sent.clientMutationId,
      body: sent,
    }),
  );
  expect(sent.expectedRevision).toBe("a".repeat(64));
  client.clear();
});

it.each(["pending", "failed"])(
  "queues behind the latest owned %s action rather than bypassing it online",
  async (status) => {
    const { result, client } = setup(null);
    state.all.mockResolvedValue([
      {
        id: "older",
        ownerId: "u1",
        url: "/api/attendance/roll-call",
        body,
        enqueuedAt: 1,
        status,
      },
      {
        id: "latest",
        ownerId: "u1",
        url: "/api/attendance/roll-call",
        body,
        enqueuedAt: 2,
        status,
      },
      {
        id: "other-owner",
        ownerId: "u2",
        url: "/api/attendance/roll-call",
        body,
        enqueuedAt: 3,
        status,
      },
      {
        id: "other-child",
        ownerId: "u1",
        url: "/api/attendance/roll-call",
        body: { ...body, childId: "c2" },
        enqueuedAt: 4,
        status,
      },
    ]);
    await act(async () => {
      await result.current.mutateAsync({ ...body, action: "sign_out" });
    });
    expect(state.mutate).not.toHaveBeenCalled();
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "u1",
        body: expect.objectContaining({
          action: "sign_out",
          dependsOnMutationId: "latest",
        }),
      }),
    );
    client.clear();
  },
);

it("requires a refreshed roll when neither a baseline nor an owned predecessor is available", async () => {
  const { result, client } = setup(undefined);
  await act(async () => {
    await expect(result.current.mutateAsync(body)).rejects.toThrow(
      "Refresh the roll",
    );
  });
  expect(state.mutate).not.toHaveBeenCalled();
  expect(state.enqueue).not.toHaveBeenCalled();
  client.clear();
});

it("uses a checked empty baseline for a walk-in absent from the loaded roll", async () => {
  const { result, client } = setup(null);
  await act(async () => {
    await result.current.mutateAsync({ ...body, childId: "walk-in" });
  });
  expect(state.mutate).toHaveBeenCalledWith(
    "/api/attendance/roll-call",
    expect.objectContaining({
      body: expect.objectContaining({
        childId: "walk-in",
        expectedRevision: null,
      }),
    }),
  );
  client.clear();
});


it("does not silently adopt a newer revision while reading the offline queue", async () => {
  const { result, client } = setup("a".repeat(64));
  let release!: (rows: unknown[]) => void;
  state.all.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  let pending!: Promise<unknown>;
  await act(async () => { pending = result.current.mutateAsync(body); });
  client.setQueryData(["roll-call", "s1", body.date, "asc"], {
    records: [{ childId: "c1", status: "present", recordRevision: "b".repeat(64) }],
  });
  await act(async () => { release([]); await pending; });
  expect(state.mutate.mock.calls[0][1].body.expectedRevision).toBe("a".repeat(64));
  client.clear();
});
