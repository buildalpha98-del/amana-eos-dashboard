// src/lib/recording-store.ts
/**
 * IndexedDB persistence for in-flight meeting recordings (Recorder v2,
 * 2026-09-14).
 *
 * WHY: MediaRecorder chunks used to live only in a React ref, so a refresh,
 * crash, or (before v2) any in-app navigation lost the whole meeting. Every
 * 30 s chunk now lands here as it arrives; on Stop the chunks are assembled
 * into one File and uploaded. A session that is still here after a reload
 * is an orphan the user can upload or discard.
 *
 * SSR/unsupported: every method resolves to a harmless empty result when
 * `indexedDB` is undefined, so callers never branch on environment.
 */

const DB_NAME = "amana-meeting-recordings";
const DB_VERSION = 1;
const SESSIONS = "sessions";
const CHUNKS = "chunks";

export interface RecordingSession {
  id: string;
  meetingId: string;
  mimeType: string;
  startedAt: number;
  updatedAt: number;
  chunkCount: number;
  status: "recording" | "stopped";
}

/**
 * Chunks are stored as ArrayBuffer + type, NOT as Blob: a jsdom Blob put into
 * fake-indexeddb comes back as `{}` (tests), and structured-cloning a Blob
 * is also the slowest path in real browsers. Reconstituted in getChunks.
 */
interface ChunkRow {
  sessionId: string;
  index: number;
  type: string;
  data: ArrayBuffer;
}

/** Blob → ArrayBuffer via FileReader (jsdom has no Blob.arrayBuffer). */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio chunk"));
    reader.readAsArrayBuffer(blob);
  });
}

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const chunks = db.createObjectStore(CHUNKS, { keyPath: ["sessionId", "index"] });
        chunks.createIndex("bySession", "sessionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> {
  if (!hasIdb()) return fallback;
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export const recordingStore = {
  createSession(input: {
    id: string;
    meetingId: string;
    mimeType: string;
    startedAt: number;
  }): Promise<void> {
    return withDb(async (db) => {
      const tx = db.transaction(SESSIONS, "readwrite");
      const row: RecordingSession = {
        ...input,
        updatedAt: input.startedAt,
        chunkCount: 0,
        status: "recording",
      };
      tx.objectStore(SESSIONS).put(row);
      await txDone(tx);
    }, undefined);
  },

  /** Persist one MediaRecorder chunk. Unknown session → no-op. */
  appendChunk(sessionId: string, index: number, blob: Blob, now: number): Promise<void> {
    return withDb(async (db) => {
      // Read the bytes BEFORE opening the transaction — an awaited FileReader
      // inside an open IDB transaction lets the transaction auto-commit.
      const data = await blobToArrayBuffer(blob);
      const tx = db.transaction([SESSIONS, CHUNKS], "readwrite");
      const sessions = tx.objectStore(SESSIONS);
      const session = (await reqToPromise(sessions.get(sessionId))) as RecordingSession | undefined;
      if (!session) return;
      const chunk: ChunkRow = { sessionId, index, type: blob.type, data };
      tx.objectStore(CHUNKS).put(chunk);
      sessions.put({
        ...session,
        chunkCount: session.chunkCount + 1,
        updatedAt: Math.max(session.updatedAt, now),
      });
      await txDone(tx);
    }, undefined);
  },

  markStopped(sessionId: string, now: number): Promise<void> {
    return withDb(async (db) => {
      const tx = db.transaction(SESSIONS, "readwrite");
      const store = tx.objectStore(SESSIONS);
      const session = (await reqToPromise(store.get(sessionId))) as RecordingSession | undefined;
      if (session) store.put({ ...session, status: "stopped", updatedAt: now });
      await txDone(tx);
    }, undefined);
  },

  listSessions(): Promise<RecordingSession[]> {
    return withDb(async (db) => {
      const tx = db.transaction(SESSIONS, "readonly");
      const rows = (await reqToPromise(tx.objectStore(SESSIONS).getAll())) as RecordingSession[];
      return rows.sort((a, b) => a.startedAt - b.startedAt);
    }, []);
  },

  /** Chunks for a session, ordered by index. */
  getChunks(sessionId: string): Promise<Blob[]> {
    return withDb(async (db) => {
      const tx = db.transaction(CHUNKS, "readonly");
      const rows = (await reqToPromise(
        tx.objectStore(CHUNKS).index("bySession").getAll(sessionId),
      )) as ChunkRow[];
      return rows
        .sort((a, b) => a.index - b.index)
        .map((r) => new Blob([r.data], { type: r.type }));
    }, []);
  },

  deleteSession(sessionId: string): Promise<void> {
    return withDb(async (db) => {
      const tx = db.transaction([SESSIONS, CHUNKS], "readwrite");
      tx.objectStore(SESSIONS).delete(sessionId);
      const chunkStore = tx.objectStore(CHUNKS);
      const keys = (await reqToPromise(
        chunkStore.index("bySession").getAllKeys(sessionId),
      )) as IDBValidKey[];
      for (const key of keys) chunkStore.delete(key);
      await txDone(tx);
    }, undefined);
  },
};
