// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { offlineQueue } from "@/lib/offline-queue";

const originalFetch = global.fetch;

function mockFetch(impl: typeof fetch) {
  global.fetch = impl;
}

describe("offlineQueue", () => {
  beforeEach(async () => {
    // wipe any existing rows
    const rows = await offlineQueue.all();
    for (const r of rows) await offlineQueue.remove(r.id);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("enqueues a mutation and reads it back", async () => {
    await offlineQueue.enqueue({
      id: "m1",
      url: "/api/services/s1/medications",
      method: "POST",
      body: {
        childId: "c1",
        medicationName: "Paracetamol",
        clientMutationId: "m1",
      },
    });
    const rows = await offlineQueue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("m1");
    expect(rows[0].status).toBe("pending");
  });

  it("drain() calls fetch and removes pending rows on 2xx", async () => {
    await offlineQueue.enqueue({
      id: "m1",
      url: "/api/x",
      method: "POST",
      body: { clientMutationId: "m1" },
    });

    mockFetch(
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 201 }),
        ),
      ) as typeof fetch,
    );

    const result = await offlineQueue.drain();
    expect(result.drained).toBe(1);
    expect(result.failed).toBe(0);
    expect(await offlineQueue.all()).toHaveLength(0);
  });

  it("marks rows as failed on 4xx", async () => {
    await offlineQueue.enqueue({
      id: "m1",
      url: "/api/x",
      method: "POST",
      body: { clientMutationId: "m1" },
    });

    mockFetch(
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "bad input" }), { status: 400 }),
        ),
      ) as typeof fetch,
    );

    const result = await offlineQueue.drain();
    expect(result.failed).toBe(1);
    const [row] = await offlineQueue.all();
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("bad input");
  });

  it("leaves rows pending on network error (drain returns 0/0 and row stays)", async () => {
    await offlineQueue.enqueue({
      id: "m1",
      url: "/api/x",
      method: "POST",
      body: { clientMutationId: "m1" },
    });

    mockFetch(
      vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch,
    );

    const result = await offlineQueue.drain();
    expect(result.drained).toBe(0);
    expect(result.failed).toBe(0);
    const rows = await offlineQueue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("subscribe() pushes count updates", async () => {
    const listener = vi.fn();
    const unsubscribe = offlineQueue.subscribe(listener);

    await offlineQueue.enqueue({
      id: "m1",
      url: "/api/x",
      method: "POST",
      body: { clientMutationId: "m1" },
    });
    // Give the async subscribe chain a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ pending: 1, failed: 0 });

    unsubscribe();
  });
});
