// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
vi.mock("next-auth/react", () => ({ getSession: vi.fn(async () => ({ user: { id: "u1" } })) }));
import { getSession } from "next-auth/react";
import { offlineQueue } from "@/lib/offline-queue";

const originalFetch = global.fetch;

function mockFetch(impl: typeof fetch) {
  global.fetch = impl;
}

describe("offlineQueue", () => {
  beforeEach(async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" }, expires: "2099-01-01" } as never);
    // wipe any existing rows
    const rows = await offlineQueue.all();
    for (const r of rows) await offlineQueue.remove(r.id);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("enqueues a mutation and reads it back", async () => {
    await offlineQueue.enqueue({
      ownerId: "u1",
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
      ownerId: "u1",
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
      ownerId: "u1",
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
      ownerId: "u1",
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
      ownerId: "u1",
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
  it("does not send another account's pending work or count it in the current account badge", async () => {
    await offlineQueue.enqueue({ ownerId: "u2", id: "other", url: "/api/x", method: "POST", body: { notes: "private" } });
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    mockFetch(fetcher);
    expect(await offlineQueue.drain()).toEqual({ drained: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await offlineQueue.counts("u1")).toEqual({ pending: 0, failed: 0 });
    expect(await offlineQueue.counts("u2")).toEqual({ pending: 1, failed: 0 });
    expect(await offlineQueue.counts(null)).toEqual({ pending: 0, failed: 0 });
    expect(await offlineQueue.all()).toHaveLength(1);
  });

  it("sends the original account header once that account signs back in", async () => {
    await offlineQueue.enqueue({ ownerId: "u2", id: "other", url: "/api/x", method: "POST", body: {} });
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u2" }, expires: "2099-01-01" } as never);
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    mockFetch(fetcher);
    expect((await offlineQueue.drain()).drained).toBe(1);
    expect(fetcher).toHaveBeenCalledWith("/api/x", expect.objectContaining({ headers: expect.objectContaining({ "x-amana-action-user": "u2" }) }));
  });

  it("leaves work pending when signed out", async () => {
    await offlineQueue.enqueue({ ownerId: "u1", id: "m1", url: "/api/x", method: "POST", body: {} });
    vi.mocked(getSession).mockResolvedValue(null);
    const fetcher = vi.fn();
    mockFetch(fetcher);
    expect(await offlineQueue.drain()).toEqual({ drained: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await offlineQueue.all())[0].status).toBe("pending");
  });

  it("retains a legacy row for review without sending it under the current account", async () => {
    await offlineQueue.enqueue({ ownerId: "u1", id: "legacy", url: "/api/x", method: "POST", body: {} });
    const [row] = await offlineQueue.all();
    delete row.ownerId;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("amana-offline-queue", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("mutations", "readwrite");
      tx.objectStore("mutations").put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const fetcher = vi.fn();
    mockFetch(fetcher);
    expect(await offlineQueue.drain()).toEqual({ drained: 0, failed: 1 });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await offlineQueue.all())[0]).toMatchObject({ id: "legacy", status: "failed", lastError: expect.stringContaining("no saved account") });
  });

  it("requires an owner for new queued work", async () => {
    await expect(offlineQueue.enqueue({ ownerId: "", id: "m1", url: "/api/x", method: "POST", body: {} })).rejects.toThrow("Sign in");
    expect(await offlineQueue.all()).toHaveLength(0);
  });

  it("does not overwrite a saved action when another account reuses its ID", async () => {
    const original = { ownerId: "u1", id: "m1", url: "/api/x", method: "POST" as const, body: { value: "original" } };
    await offlineQueue.enqueue(original);
    await expect(offlineQueue.enqueue({ ...original, ownerId: "u2" })).rejects.toThrow("different details");
    expect((await offlineQueue.all())[0]).toMatchObject(original);
  });

  it("preserves queue order and retry history on an identical enqueue", async () => {
    const original = { ownerId: "u1", id: "m1", url: "/api/x", method: "POST" as const, body: {} };
    await offlineQueue.enqueue(original);
    await offlineQueue.markFailed("m1", "Needs review");
    const before = (await offlineQueue.all())[0];
    await offlineQueue.enqueue(original);
    expect((await offlineQueue.all())[0]).toEqual(before);
    await expect(offlineQueue.enqueue({ ...original, body: { changed: true } })).rejects.toThrow("different details");
  });

  it("persists network attempts and blocks later actions until the failed first save is reviewed", async () => {
    await offlineQueue.enqueue({ ownerId: "u1", id: "arrival", url: "/api/x", method: "POST", body: { action: "sign_in" } });
    await offlineQueue.enqueue({ ownerId: "u1", id: "collection", url: "/api/x", method: "POST", body: { action: "sign_out" } });
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    mockFetch(fetcher);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await offlineQueue.drain();
      expect((await offlineQueue.all()).find(r => r.id === "arrival")?.attempts).toBe(attempt);
      expect(fetcher).toHaveBeenCalledTimes(attempt);
    }
    expect((await offlineQueue.all()).find(r => r.id === "arrival")?.status).toBe("failed");
    await offlineQueue.drain();
    expect(fetcher).toHaveBeenCalledTimes(3);
    await offlineQueue.review("arrival", "u1", "retry");
    const success = vi.fn(async () => new Response('{}', { status: 200 }));
    mockFetch(success);
    expect(await offlineQueue.drain()).toEqual({ drained: 2, failed: 0 });
    expect(success.mock.calls.map(call => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).action)).toEqual(["sign_in", "sign_out"]);
  });

  it("a server rejection blocks later saves across subsequent drains", async () => {
    for (const id of ["first", "second"]) await offlineQueue.enqueue({ ownerId: "u1", id, url: "/api/x", method: "POST", body: {} });
    const fetcher = vi.fn(async () => new Response('{"error":"Check arrival"}', { status: 409 }));
    mockFetch(fetcher);
    await offlineQueue.drain();
    await offlineQueue.drain();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await offlineQueue.all()).find(r => r.id === "first")).toMatchObject({ attempts: 1, status: "failed" });
    await offlineQueue.review("first", "u1", "discard");
    expect((await offlineQueue.all()).map(r => r.id)).toEqual(["second"]);
  });

  it("retains server failure attempts between drains", async () => {
    await offlineQueue.enqueue({ ownerId: "u1", id: "m1", url: "/api/x", method: "POST", body: {} });
    mockFetch(vi.fn(async () => new Response('{}', { status: 503 })));
    for (let i = 0; i < 3; i++) await offlineQueue.drain();
    expect((await offlineQueue.all())[0]).toMatchObject({ attempts: 3, status: "failed", lastError: "HTTP 503" });
  });

  it("preserves insertion order even when two taps have the same clock timestamp", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      await offlineQueue.enqueue({ ownerId: "u1", id: "z-first", url: "/api/x", method: "POST", body: {} });
      await offlineQueue.enqueue({ ownerId: "u1", id: "a-second", url: "/api/x", method: "POST", body: {} });
      const rows = (await offlineQueue.all()).sort((a,b) => a.enqueuedAt-b.enqueuedAt);
      expect(rows.map(r => r.id)).toEqual(["z-first", "a-second"]);
    } finally { now.mockRestore(); }
  });

  it("refuses recovery actions from a different account", async () => {
    await offlineQueue.enqueue({ ownerId: "u2", id: "other", url: "/api/x", method: "POST", body: {} });
    await offlineQueue.markFailed("other", "Needs review");
    await expect(offlineQueue.review("other", "u1", "discard")).rejects.toThrow("unavailable");
    await expect(offlineQueue.review("other", "u2", "retry")).rejects.toThrow("Sign back");
    expect(await offlineQueue.all()).toHaveLength(1);
  });

});
