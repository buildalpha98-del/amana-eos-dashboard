"use client";

import { getSession } from "next-auth/react";
import { OFFLINE_ACTOR_HEADER } from "@/lib/offline-identity";

/**
 * IndexedDB-backed mutation queue for offline-resilient staff actions.
 *
 * Each queued mutation retains its originating account and clientMutationId.
 * Server replay guarantees depend on the endpoint; an ID alone does not make
 * a write idempotent. Current callers include:
 *
 *   - POST /api/services/[id]/medications          (clientMutationId required)
 *   - POST /api/services/[id]/observations         (clientMutationId optional)
 *   - POST /api/services/[id]/reflections          (clientMutationId optional)
 *   - POST /api/attendance/roll-call             (first-handover guards)
 *
 * Drain strategy: FIFO by enqueuedAt. Up to 3 retries per row (network errors
 * only — 4xx responses mark the row as "failed" with the server error for
 * manual review). Browser `online` event triggers an immediate drain.
 */

const DB_NAME = "amana-offline-queue";
const DB_VERSION = 1;
const STORE = "mutations";

export interface QueuedMutation {
  /** Missing only on legacy rows, which must never replay automatically. */
  ownerId?: string;
  id: string; // idbKey — same as clientMutationId
  url: string;
  method: "POST" | "PATCH" | "PUT";
  body: Record<string, unknown>;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "failed";
}

type DrainListener = (count: { pending: number; failed: number }) => void;

class OfflineQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private listeners = new Map<DrainListener, string | null | undefined>();
  private draining = false;

  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available in this environment");
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id" });
            store.createIndex("enqueuedAt", "enqueuedAt");
            store.createIndex("status", "status");
          }
        };
        req.onsuccess = () => resolve(req.result);
      });
    }
    return this.dbPromise;
  }

  async enqueue(
    m: Omit<QueuedMutation, "enqueuedAt" | "attempts" | "status"> & {
      ownerId: string;
    },
  ): Promise<void> {
    if (!m.ownerId) throw new Error("Sign in before saving work offline.");
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const row: QueuedMutation = {
      ...m,
      enqueuedAt: Date.now(),
      attempts: 0,
      status: "pending",
    };
    await new Promise<void>((resolve, reject) => {
      const existing = store.get(row.id);
      existing.onsuccess = () => {
        const saved = existing.result as QueuedMutation | undefined;
        if (saved) {
          if (
            saved.ownerId !== row.ownerId ||
            saved.url !== row.url ||
            saved.method !== row.method ||
            JSON.stringify(saved.body) !== JSON.stringify(row.body)
          ) {
            reject(
              new Error(
                "This offline action ID is already saved with different details. Review the original action before trying again.",
              ),
            );
            tx.abort();
          }
          // An identical retry keeps its original owner, order and attempts.
          return;
        }
        const latest = store.index("enqueuedAt").openCursor(null, "prev");
        latest.onsuccess = () => {
          const previous = latest.result?.value as QueuedMutation | undefined;
          row.enqueuedAt = Math.max(
            row.enqueuedAt,
            (previous?.enqueuedAt ?? 0) + 1,
          );
          store.put(row);
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Offline save was cancelled."));
    });
    this.notify();
  }

  async all(): Promise<QueuedMutation[]> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    return new Promise<QueuedMutation[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as QueuedMutation[]);
      req.onerror = () => reject(req.error);
    });
  }

  async counts(
    ownerId?: string | null,
  ): Promise<{ pending: number; failed: number }> {
    const rows = (await this.all()).filter(
      (row) =>
        ownerId === undefined ||
        (ownerId !== null && (!row.ownerId || row.ownerId === ownerId)),
    );
    return {
      pending: rows.filter((r) => r.status === "pending").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.notify();
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.recordFailure(id, error, true);
  }

  private async recordFailure(
    id: string,
    error: string,
    permanent: boolean,
  ): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result as QueuedMutation | undefined;
        if (row) {
          row.attempts += 1;
          row.status = permanent || row.attempts >= 3 ? "failed" : "pending";
          row.lastError = error;
          store.put(row);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Offline update was cancelled."));
    });
    this.notify();
  }

  async review(
    id: string,
    ownerId: string,
    action: "retry" | "discard",
  ): Promise<void> {
    if (this.draining) throw new Error("Please wait for syncing to finish.");
    const session = await getSession();
    if (!ownerId || session?.user?.id !== ownerId)
      throw new Error("Sign back into the account that saved this action.");
    if (this.draining) throw new Error("Please wait for syncing to finish.");
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result as QueuedMutation | undefined;
        if (!row || row.ownerId !== ownerId || row.status !== "failed") {
          reject(
            new Error("This action is unavailable for review in this account."),
          );
          tx.abort();
          return;
        }
        if (action === "discard") store.delete(id);
        else
          store.put({
            ...row,
            status: "pending",
            attempts: 0,
            lastError: undefined,
          });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Offline review was cancelled."));
    });
    this.notify();
  }

  async drain(): Promise<{ drained: number; failed: number }> {
    if (this.draining) return { drained: 0, failed: 0 };
    this.draining = true;
    try {
      const session = await getSession();
      const ownerId = session?.user?.id;
      if (!ownerId) return { drained: 0, failed: 0 };
      const rows = (await this.all()).sort(
        (a, b) => a.enqueuedAt - b.enqueuedAt,
      );
      let drained = 0;
      let failed = 0;
      for (const row of rows) {
        if (!row.ownerId) {
          if (row.status === "failed") continue;
          await this.markFailed(
            row.id,
            "This older offline action has no saved account. Review the original record before entering it again.",
          );
          failed += 1;
          continue;
        }
        if (row.ownerId !== ownerId) continue;
        // A rejected earlier action is a barrier until its owner reviews it.
        if (row.status === "failed") break;
        let res: Response;
        try {
          res = await fetch(row.url, {
            method: row.method,
            headers: {
              "Content-Type": "application/json",
              [OFFLINE_ACTOR_HEADER]: row.ownerId,
            },
            body: JSON.stringify(row.body),
          });
        } catch (err) {
          await this.recordFailure(
            row.id,
            err instanceof Error ? err.message : "Connection interrupted",
            false,
          );
          if (row.attempts + 1 >= 3) failed += 1;
          break;
        }
        if (res.ok) {
          await this.remove(row.id);
          drained += 1;
          continue;
        }
        const permanent = res.status >= 400 && res.status < 500;
        const body = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        const message =
          typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
        await this.recordFailure(row.id, message, permanent);
        if (permanent || row.attempts + 1 >= 3) failed += 1;
        // Never send a later action while an earlier one remains unresolved.
        break;
      }
      this.notify();
      return { drained, failed };
    } finally {
      this.draining = false;
    }
  }

  subscribe(listener: DrainListener, ownerId?: string | null): () => void {
    this.listeners.set(listener, ownerId);
    // Fire immediately
    this.counts(ownerId)
      .then((c) => {
        if (
          this.listeners.has(listener) &&
          this.listeners.get(listener) === ownerId
        )
          listener(c);
      })
      .catch(() => {});
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    if (this.listeners.size === 0) return;
    for (const [listener, ownerId] of this.listeners) {
      this.counts(ownerId)
        .then((c) => {
          if (
            this.listeners.has(listener) &&
            this.listeners.get(listener) === ownerId
          )
            listener(c);
        })
        .catch(() => {});
    }
  }
}

export const offlineQueue = new OfflineQueue();

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    offlineQueue.drain().catch(() => {});
  });
}
