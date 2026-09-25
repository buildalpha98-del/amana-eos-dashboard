# Meeting Recorder v2 — Navigation-proof, crash-proof capture

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live L10 recording survives navigating anywhere in the dashboard, survives a refresh or crash with at most 30 seconds lost, stops only on Stop or on meeting completion, and fails loudly.

**Architecture:** The MediaRecorder and its buffer move out of the meeting page into a `MeetingRecorderProvider` mounted in the dashboard layout, so route changes cannot unmount it. Every 30-second chunk is persisted to IndexedDB as it arrives; on Stop the chunks are assembled into one file and pushed through the EXISTING upload → `POST /api/meetings/[id]/recordings` → Deepgram pipeline (no server changes). On mount the provider looks for orphaned IndexedDB sessions (crash/refresh) and offers Upload/Discard on the meeting. A floating REC pill in the layout shows recording state everywhere.

**Tech Stack:** Next.js 16 app router, React context, MediaRecorder, IndexedDB (`fake-indexeddb` in tests), TanStack Query, Vitest + Testing Library (jsdom).

**Spec context:** `docs/superpowers/specs/2026-08-31-eos-meetings-todos-ai-design.md` §2 (Phase 2). Why v2: on 2026-09-08 the first real L10 recording was silently discarded because the recorder lived inside `ActiveMeetingView`, which unmounts on any sidebar click ([useMeetingRecorder.ts:148](../../../src/hooks/useMeetingRecorder.ts)).

**Conventions that apply (from `~/.claude/CLAUDE.md` + repo `CLAUDE.md`):** design tokens only (no raw grays), `Button` from `@/components/ui/Button`, icon-only buttons need `aria-label`, mutations surface errors with `toast({ variant: "destructive" })`, no `console.*` in production code, delete dead code (the old hook goes), Testing Library hook tests use `// @vitest-environment jsdom`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/recording-store.ts` (create) | IndexedDB persistence: sessions + ordered chunks. Pure data layer, no React. SSR-safe (no `indexedDB` → no-ops). |
| `src/lib/recording-capture.ts` (create) | Pure helpers: pick a supported MIME, file extension, `describeMicError(err)` (the message table currently inside the hook). |
| `src/components/meetings/MeetingRecorderProvider.tsx` (create) | React context owning MediaRecorder, elapsed timer, persistence, stop→upload→register, orphan recovery. Mounted once in the dashboard layout. |
| `src/components/meetings/RecordingIndicator.tsx` (create) | Floating REC pill: elapsed time, Stop, "Back to meeting" link. Rendered by the layout. |
| `src/components/meetings/RecordingRecoveryBanner.tsx` (create) | "Unfinished recording found" banner with Upload / Discard, rendered inside the meeting view. |
| `src/components/meetings/ActiveMeetingView.tsx` (modify) | Use the context instead of the hook; auto-stop on completion; render the recovery banner. |
| `src/app/(dashboard)/layout.tsx` (modify) | Mount `MeetingRecorderProvider` + `RecordingIndicator`. |
| `src/hooks/useMeetingRecorder.ts` (delete) | Superseded. |
| Tests | `src/__tests__/lib/recording-store.test.ts`, `src/__tests__/lib/recording-capture.test.ts`, `src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx`, `src/__tests__/components/meetings/RecordingIndicator.test.tsx` |

Work in the worktree `.claude/worktrees/meeting-recorder-v2` on branch `feat/meeting-recorder-v2` (already created off `origin/main`; `node_modules` is symlinked, `.env.local` copied — both are git-ignored). Run tests with `npx vitest run <path>` from that directory.

---

## Chunk 1: Pure libraries

### Task 1: `recording-store.ts` — IndexedDB sessions + chunks

**Files:**
- Create: `src/lib/recording-store.ts`
- Test: `src/__tests__/lib/recording-store.test.ts`

Data model:

```ts
export interface RecordingSession {
  id: string;            // crypto.randomUUID()
  meetingId: string;
  mimeType: string;      // e.g. "audio/webm;codecs=opus"
  startedAt: number;     // Date.now()
  updatedAt: number;     // bumped on every chunk
  chunkCount: number;
  status: "recording" | "stopped";
}
```

DB `amana-meeting-recordings`, version 1, two object stores: `sessions` (keyPath `id`) and `chunks` (keyPath `["sessionId", "index"]`, index `bySession` on `sessionId`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/recording-store.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { recordingStore } from "@/lib/recording-store";

const blob = (s: string) => new Blob([s], { type: "audio/webm" });

// jsdom Blobs have no .text()/.arrayBuffer(); FileReader works everywhere.
export function readBlobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

describe("recordingStore", () => {
  beforeEach(async () => {
    for (const s of await recordingStore.listSessions()) {
      await recordingStore.deleteSession(s.id);
    }
  });

  it("creates a session and lists it", async () => {
    await recordingStore.createSession({
      id: "s1", meetingId: "m1", mimeType: "audio/webm", startedAt: 1000,
    });
    const all = await recordingStore.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: "s1", meetingId: "m1", status: "recording", chunkCount: 0, updatedAt: 1000,
    });
  });

  it("appends chunks in order, bumps chunkCount/updatedAt, and reads them back ordered", async () => {
    await recordingStore.createSession({ id: "s1", meetingId: "m1", mimeType: "audio/webm", startedAt: 1 });
    await recordingStore.appendChunk("s1", 0, blob("a"), 10);
    await recordingStore.appendChunk("s1", 2, blob("c"), 30);
    await recordingStore.appendChunk("s1", 1, blob("b"), 20);
    const chunks = await recordingStore.getChunks("s1");
    expect(chunks.every((c) => c instanceof Blob)).toBe(true);
    expect(chunks[0].type).toBe("audio/webm");
    expect(await Promise.all(chunks.map(readBlobText))).toEqual(["a", "b", "c"]);
    const [s] = await recordingStore.listSessions();
    expect(s.chunkCount).toBe(3);
    expect(s.updatedAt).toBe(30);
  });

  it("marks a session stopped", async () => {
    await recordingStore.createSession({ id: "s1", meetingId: "m1", mimeType: "audio/webm", startedAt: 1 });
    await recordingStore.markStopped("s1", 99);
    const [s] = await recordingStore.listSessions();
    expect(s.status).toBe("stopped");
    expect(s.updatedAt).toBe(99);
  });

  it("deleteSession removes the session and all its chunks", async () => {
    await recordingStore.createSession({ id: "s1", meetingId: "m1", mimeType: "audio/webm", startedAt: 1 });
    await recordingStore.appendChunk("s1", 0, blob("a"), 2);
    await recordingStore.createSession({ id: "s2", meetingId: "m1", mimeType: "audio/webm", startedAt: 1 });
    await recordingStore.appendChunk("s2", 0, blob("z"), 2);
    await recordingStore.deleteSession("s1");
    expect(await recordingStore.listSessions()).toHaveLength(1);
    expect(await recordingStore.getChunks("s1")).toEqual([]);
    expect(await recordingStore.getChunks("s2")).toHaveLength(1);
  });

  it("appendChunk on an unknown session is a no-op", async () => {
    await recordingStore.appendChunk("nope", 0, blob("a"), 2);
    expect(await recordingStore.getChunks("nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/recording-store.test.ts`
Expected: FAIL — cannot resolve `@/lib/recording-store`.

- [ ] **Step 3: Implement**

```ts
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
        // Chunks can be persisted out of order; count and activity time must
        // never go backwards (the recovery UI shows updatedAt - startedAt).
        chunkCount: Math.max(session.chunkCount, index + 1),
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/recording-store.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recording-store.ts src/__tests__/lib/recording-store.test.ts
git commit -m "feat(recorder): IndexedDB store for in-flight meeting recording chunks"
```

### Task 2: `recording-capture.ts` — MIME pick + mic error copy

**Files:**
- Create: `src/lib/recording-capture.ts`
- Test: `src/__tests__/lib/recording-capture.test.ts`

The message table is lifted verbatim from `src/hooks/useMeetingRecorder.ts:68-95` (which is deleted in Task 5) so behaviour is unchanged, but now unit-tested.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/recording-capture.test.ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  describeMicError,
  extensionForMime,
  pickRecordingMime,
  RECORDING_MIME_CANDIDATES,
} from "@/lib/recording-capture";

describe("pickRecordingMime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when MediaRecorder is missing", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecordingMime()).toBeNull();
  });

  it("returns the first supported candidate in priority order", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t === "audio/mp4" || t === "audio/webm",
    });
    expect(pickRecordingMime()).toBe("audio/webm");
    expect(RECORDING_MIME_CANDIDATES[0]).toBe("audio/webm;codecs=opus");
  });

  it("returns null when nothing is supported", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickRecordingMime()).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("maps mp4 to m4a and everything else to webm", () => {
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
  });
});

describe("describeMicError", () => {
  const dom = (name: string) => new DOMException("x", name);
  it("names permission denial and points at both permission layers", () => {
    expect(describeMicError(dom("NotAllowedError"))).toMatch(/permission was denied/i);
    expect(describeMicError(dom("SecurityError"))).toMatch(/System Settings/);
  });
  it("names a missing device", () => {
    expect(describeMicError(dom("NotFoundError"))).toMatch(/No microphone was found/);
    expect(describeMicError(dom("OverconstrainedError"))).toMatch(/No microphone was found/);
  });
  it("names a busy device", () => {
    expect(describeMicError(dom("NotReadableError"))).toMatch(/busy/);
    expect(describeMicError(dom("AbortError"))).toMatch(/busy/);
  });
  it("falls back with the error name when known, generic otherwise", () => {
    expect(describeMicError(dom("WeirdError"))).toMatch(/\(WeirdError\)/);
    expect(describeMicError(new Error("boom"))).toMatch(/Couldn't access the microphone\./);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/recording-capture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/recording-capture.ts
/**
 * Browser-capture helpers shared by the meeting recorder provider
 * (Recorder v2, 2026-09-14). Pure functions — no React, no state.
 */

export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari
] as const;

/** First MIME the current browser can record, or null when it can't record. */
export function pickRecordingMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function extensionForMime(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

/** `mm:ss`, minutes unbounded (61:01 past the hour). Shared by the REC pill and the meeting view. */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Name the ACTUAL getUserMedia failure. Lumping everything into "blocked"
 * once sent people hunting site permissions when the real problem was the
 * macOS-level browser mic toggle or a busy device (2026-09-01).
 */
export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was denied. Check BOTH: the site permission (icon next to the address bar → Microphone → Allow), and on a Mac, System Settings → Privacy & Security → Microphone → allow your browser, then fully quit and reopen it.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in (or check the input device in your browser's microphone settings) and try again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is busy — another app (Teams/Zoom/etc.) is probably using it. Close it and try again.";
  }
  return `Couldn't access the microphone${name ? ` (${name})` : ""}. Check browser and system mic permissions, then try again.`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/recording-capture.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recording-capture.ts src/__tests__/lib/recording-capture.test.ts
git commit -m "feat(recorder): pure capture helpers — MIME pick + mic error copy"
```

---

## Chunk 2: Provider and indicator

### Task 3: `MeetingRecorderProvider` — the navigation-proof recorder

**Files:**
- Create: `src/components/meetings/MeetingRecorderProvider.tsx`
- Test: `src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx`

Contract:

```ts
export interface RecoverableRecording {
  sessionId: string;
  meetingId: string;
  startedAt: number;
  updatedAt: number;
  chunkCount: number;
}

export interface MeetingRecorderContextValue {
  status: "idle" | "recording" | "uploading";
  meetingId: string | null;      // meeting being recorded/uploaded
  startedAt: number | null;      // ms epoch of the live session; null when idle/uploading
  error: string | null;          // last capture failure (also toasted)
  start: (meetingId: string) => Promise<void>;
  stop: () => Promise<void>;     // stops, assembles, uploads, registers
  recoverable: RecoverableRecording[];  // orphaned sessions found in IndexedDB
  uploadRecoverable: (sessionId: string) => Promise<void>;
  discardRecoverable: (sessionId: string) => Promise<void>;
}

/** Ticks once a second while `startedAt` is set; consumers own the re-render, not the provider. */
export function useElapsedSeconds(startedAt: number | null): number;

/** Three missed 30 s chunks — only then is a "recording" session considered orphaned. */
export const LIVE_SESSION_GRACE_MS = 90_000;
```

Behaviour rules (each has a test):
1. `start(meetingId)`: pick MIME (null → error "This browser can't record audio — try Chrome, Edge or Safari."), `getUserMedia({ audio: true })` (throw → `describeMicError`), create IndexedDB session, `MediaRecorder.start(30_000)`; each `dataavailable` chunk with `size > 0` is appended to the store AND kept in a ref; the context publishes `startedAt` and NOTHING that ticks — the 1 s timer lives in `useElapsedSeconds(startedAt)` inside each consumer that shows mm:ss, so the provider (and the dashboard layout shell that consumes it) does not re-render every second for 90 minutes. `status` → `"recording"`. Calling `start` while not idle is a no-op.
2. `stop()`: `recorder.stop()`; on `onstop` assemble `new File(chunksRef, "l10-recording-<ts>.<ext>", { type: mime.split(";")[0] })`, `status` → `"uploading"`, `uploadFileSmart(file, { context: "recording" })`, then `mutateApi("/api/meetings/<id>/recordings", { method: "POST", body: { url, source: "live_mic", durationSeconds } })`, invalidate `["meeting-recordings", meetingId]`, delete the store session, toast "Recording uploaded — transcribing now." → `status` idle. Upload/register failure: `markStopped` the session (so it becomes recoverable), destructive toast, `status` idle, refresh `recoverable`.
3. Mic dropped mid-recording (audio track `ended` event, or `recorder.onerror`): set `error` = "The microphone stopped — recording was cut short. Uploading what was captured.", destructive toast, then behave as `stop()`.
4. Provider mount: `recordingStore.listSessions()` → every session is `recoverable` (a live session is removed from the list as soon as `start` creates it, and re-added if its upload fails) EXCEPT sessions with `status === "recording"` whose `updatedAt` is within `LIVE_SESSION_GRACE_MS` (90 s) — those belong to another tab that is still writing chunks, and offering Discard on them would let a manager kill a colleague's meeting mid-record. A "stopped" session is always recoverable regardless of freshness. `uploadRecoverable(id)`: assemble chunks from the store into a File (mime from session, `durationSeconds = Math.round((updatedAt - startedAt)/1000)`), same upload→register→delete path; `discardRecoverable(id)`: delete the session.
5. `beforeunload` guard while `status === "recording"` (kept from v1 — a refresh still loses ≤30 s and stops the mic).
6. The provider never stops the recorder because a child unmounted — it is mounted in the layout, so nothing below it can kill the stream. The provider ITSELF unmounting (client-side navigation out of the dashboard layout) releases the hardware via `useEffect(() => () => { releaseHardware(); }, [releaseHardware])` so the mic can never stay live behind an unmounted tree.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const uploadFileSmart = vi.fn();
const mutateApi = vi.fn();
const toast = vi.fn();
vi.mock("@/lib/upload-client", () => ({ uploadFileSmart: (...a: unknown[]) => uploadFileSmart(...a) }));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: (...a: unknown[]) => mutateApi(...a), fetchApi: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { recordingStore } from "@/lib/recording-store";
import {
  MeetingRecorderProvider,
  useMeetingRecorder,
} from "@/components/meetings/MeetingRecorderProvider";

// jsdom Blobs have no .text(); FileReader works in jsdom and browsers.
function readBlobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

// ── Fake MediaRecorder ──────────────────────────────────────────
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (t: string) => t === "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  state = "inactive";
  constructor(public stream: unknown, public options: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text], { type: "audio/webm" }) }); }
}

function makeStream() {
  const track = { stop: vi.fn(), onended: null as null | (() => void), kind: "audio" };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    track,
  };
}

// ONE QueryClient for the file: every renderHook must talk to the same
// provider instance semantics (a fresh client per render is fine for the
// hook tests, but test 1 below deliberately renders a single provider).
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MeetingRecorderProvider>{children}</MeetingRecorderProvider>
    </QueryClientProvider>
  );
}

// Consumer that exposes the context to the test; toggled off to simulate the
// meeting page unmounting underneath the (still-mounted) provider.
let latest: ReturnType<typeof useMeetingRecorder> | null = null;
function Probe() {
  latest = useMeetingRecorder();
  return null;
}

describe("MeetingRecorderProvider", () => {
  let stream: ReturnType<typeof makeStream>;

  beforeEach(async () => {
    // shouldAdvanceTime is REQUIRED: without it `waitFor` never yields to the
    // microtask queue and the async tests hang (see InstallBanner.test.tsx).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    FakeMediaRecorder.instances = [];
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    stream = makeStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    uploadFileSmart.mockReset().mockResolvedValue({ fileUrl: "https://x.blob.vercel-storage.com/a.webm", fileName: "a.webm" });
    mutateApi.mockReset().mockResolvedValue({ id: "rec1" });
    toast.mockReset();
    for (const s of await recordingStore.listSessions()) await recordingStore.deleteSession(s.id);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts recording, persists chunks, and keeps recording when the consumer page unmounts", async () => {
    const qc = new QueryClient();
    const tree = (showPage: boolean) => (
      <QueryClientProvider client={qc}>
        <MeetingRecorderProvider>{showPage ? <Probe /> : null}</MeetingRecorderProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree(true));
    await act(async () => { await latest!.start("m1"); });
    expect(latest!.status).toBe("recording");
    expect(latest!.meetingId).toBe("m1");

    const rec = FakeMediaRecorder.instances[0];
    await act(async () => { rec.emit("chunk-0"); });
    await waitFor(async () => {
      const [s] = await recordingStore.listSessions();
      expect(s?.chunkCount).toBe(1);
    });

    // The meeting page (consumer) unmounts; the provider stays mounted.
    rerender(tree(false));
    expect(rec.state).toBe("recording");
    expect(stream.track.stop).not.toHaveBeenCalled();

    // Coming back sees the same live session.
    rerender(tree(true));
    expect(latest!.status).toBe("recording");
    expect(latest!.meetingId).toBe("m1");
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("stop assembles the chunks, uploads, registers the recording, and clears the store", async () => {
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    const rec = FakeMediaRecorder.instances[0];
    await act(async () => { rec.emit("aa"); rec.emit("bb"); });
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(uploadFileSmart).toHaveBeenCalledTimes(1);
    const [file, opts] = uploadFileSmart.mock.calls[0] as [File, { context: string }];
    expect(file.name).toMatch(/^l10-recording-\d+\.webm$/);
    expect(await readBlobText(file)).toBe("aabb");
    expect(opts).toEqual({ context: "recording" });
    expect(mutateApi).toHaveBeenCalledWith(
      "/api/meetings/m1/recordings",
      expect.objectContaining({ method: "POST", body: expect.objectContaining({ source: "live_mic", url: "https://x.blob.vercel-storage.com/a.webm" }) }),
    );
    expect(await recordingStore.listSessions()).toEqual([]);
    expect(stream.track.stop).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/uploaded/i) }));
  });

  it("keeps the session recoverable and toasts when the upload fails", async () => {
    uploadFileSmart.mockRejectedValueOnce(new Error("Blob down"));
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    await act(async () => { FakeMediaRecorder.instances[0].emit("aa"); });
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringContaining("Blob down") }));
    await waitFor(() => expect(result.current.recoverable).toHaveLength(1));
    expect(result.current.recoverable[0].meetingId).toBe("m1");
    const [s] = await recordingStore.listSessions();
    expect(s.status).toBe("stopped");
  });

  it("surfaces a denied microphone as a named error and stays idle", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new DOMException("x", "NotAllowedError"));
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/permission was denied/i);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("a dropped microphone track cuts the recording short and uploads what exists", async () => {
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    await act(async () => { FakeMediaRecorder.instances[0].emit("aa"); });
    await act(async () => { stream.track.onended?.(); });
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringMatching(/microphone stopped/i) }));
    expect(uploadFileSmart).toHaveBeenCalledTimes(1);
  });

  it("finds an orphaned session on mount and can upload or discard it", async () => {
    await recordingStore.createSession({ id: "orphan", meetingId: "m9", mimeType: "audio/webm;codecs=opus", startedAt: 1_000 });
    await recordingStore.appendChunk("orphan", 0, new Blob(["zz"]), 61_000);

    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(result.current.recoverable).toHaveLength(1));
    expect(result.current.recoverable[0]).toMatchObject({ sessionId: "orphan", meetingId: "m9", chunkCount: 1 });

    await act(async () => { await result.current.uploadRecoverable("orphan"); });
    expect(mutateApi).toHaveBeenCalledWith(
      "/api/meetings/m9/recordings",
      expect.objectContaining({ body: expect.objectContaining({ source: "live_mic", durationSeconds: 60 }) }),
    );
    await waitFor(() => expect(result.current.recoverable).toHaveLength(0));
    expect(await recordingStore.listSessions()).toEqual([]);

    await recordingStore.createSession({ id: "orphan2", meetingId: "m9", mimeType: "audio/webm", startedAt: 1 });
    const { result: r2 } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(r2.current.recoverable).toHaveLength(1));
    await act(async () => { await r2.current.discardRecoverable("orphan2"); });
    expect(await recordingStore.listSessions()).toEqual([]);
    expect(uploadFileSmart).toHaveBeenCalledTimes(1);
  });

  it("useMeetingRecorder throws outside the provider", () => {
    expect(() => renderHook(() => useMeetingRecorder())).toThrow(/MeetingRecorderProvider/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/meetings/MeetingRecorderProvider.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { uploadFileSmart } from "@/lib/upload-client";
import { toast } from "@/hooks/useToast";
import { recordingStore, type RecordingSession } from "@/lib/recording-store";
import {
  describeMicError,
  extensionForMime,
  pickRecordingMime,
} from "@/lib/recording-capture";
import type { MeetingRecordingData } from "@/hooks/useMeetingRecordings";

/**
 * Meeting recorder v2 (2026-09-14) — lives ABOVE routing.
 *
 * v1 kept the MediaRecorder inside ActiveMeetingView, so the first real L10
 * recording was silently thrown away the moment someone clicked a sidebar
 * link. This provider is mounted once in the dashboard layout: navigation
 * cannot unmount it, every 30 s chunk is persisted to IndexedDB as it
 * arrives, and only Stop / meeting completion / a dead mic ends a session.
 * Orphaned sessions (crash, refresh) surface as `recoverable`.
 */

const TIMESLICE_MS = 30_000;
/**
 * A session another tab is still recording has status "recording" AND a
 * fresh `updatedAt` (a chunk lands every TIMESLICE_MS). Three missed chunks
 * means the owning tab is gone — only then may it be offered for recovery,
 * otherwise a manager could Discard a colleague's live meeting mid-record.
 */
export const LIVE_SESSION_GRACE_MS = 90_000;

export interface RecoverableRecording {
  sessionId: string;
  meetingId: string;
  startedAt: number;
  updatedAt: number;
  chunkCount: number;
}

export type RecorderStatus = "idle" | "recording" | "uploading";

export interface MeetingRecorderContextValue {
  status: RecorderStatus;
  meetingId: string | null;
  /** ms epoch of the live session; null when idle/uploading. */
  startedAt: number | null;
  error: string | null;
  start: (meetingId: string) => Promise<void>;
  stop: () => Promise<void>;
  recoverable: RecoverableRecording[];
  uploadRecoverable: (sessionId: string) => Promise<void>;
  discardRecoverable: (sessionId: string) => Promise<void>;
}

const MeetingRecorderContext = createContext<MeetingRecorderContextValue | null>(null);

export function useMeetingRecorder(): MeetingRecorderContextValue {
  const ctx = useContext(MeetingRecorderContext);
  if (!ctx) throw new Error("useMeetingRecorder must be used within MeetingRecorderProvider");
  return ctx;
}

function elapsedSince(startedAt: number | null): number {
  return startedAt === null ? 0 : Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

/** Ticks once a second while `startedAt` is set; consumers own the re-render, not the provider. */
export function useElapsedSeconds(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() => elapsedSince(startedAt));
  // Re-anchor in render when the session changes (React's "adjusting state
  // when a prop changes" pattern) so a new startedAt never shows a stale
  // count for its first second, and null snaps back to 0 immediately.
  const [prevStartedAt, setPrevStartedAt] = useState(startedAt);
  if (prevStartedAt !== startedAt) {
    setPrevStartedAt(startedAt);
    setElapsed(elapsedSince(startedAt));
  }
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setElapsed(elapsedSince(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

function toRecoverable(s: RecordingSession): RecoverableRecording {
  return {
    sessionId: s.id,
    meetingId: s.meetingId,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    chunkCount: s.chunkCount,
  };
}

function buildFile(chunks: Blob[], mime: string): File {
  const type = mime.split(";")[0];
  return new File([new Blob(chunks, { type })], `l10-recording-${Date.now()}.${extensionForMime(mime)}`, { type });
}

export function MeetingRecorderProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<RecoverableRecording[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<{ id: string; meetingId: string; mime: string; startedAt: number } | null>(null);
  const stopResolveRef = useRef<(() => void) | null>(null);
  // Guards the async gap in start() (permission prompt) against a double-click.
  const startingRef = useRef(false);
  // Mirror of `status` for callbacks that must not depend on a stale closure.
  const statusRef = useRef<RecorderStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refreshRecoverable = useCallback(async () => {
    const sessions = await recordingStore.listSessions();
    const liveId = sessionRef.current?.id;
    const staleBefore = Date.now() - LIVE_SESSION_GRACE_MS;
    setRecoverable(
      sessions
        .filter((s) => s.id !== liveId)
        // Still being written by another tab — not ours to upload or discard.
        .filter((s) => !(s.status === "recording" && s.updatedAt > staleBefore))
        .map(toRecoverable),
    );
  }, []);

  useEffect(() => {
    refreshRecoverable().catch(() => setRecoverable([]));
  }, [refreshRecoverable]);

  const fail = useCallback((message: string) => {
    setError(message);
    toast({ variant: "destructive", description: message });
  }, []);

  const releaseHardware = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  /** Upload + register one assembled file; on failure keep the store session. */
  const uploadAndRegister = useCallback(
    async (args: { sessionId: string; meetingId: string; file: File; durationSeconds: number }) => {
      setStatus("uploading");
      setMeetingId(args.meetingId);
      try {
        const result = await uploadFileSmart(args.file, { context: "recording" });
        await mutateApi<MeetingRecordingData>(`/api/meetings/${args.meetingId}/recordings`, {
          method: "POST",
          body: { url: result.fileUrl, source: "live_mic", durationSeconds: args.durationSeconds },
        });
        await recordingStore.deleteSession(args.sessionId);
        queryClient.invalidateQueries({ queryKey: ["meeting-recordings", args.meetingId] });
        toast({ description: "Recording uploaded — transcribing now. The AI review lands on the meeting in a few minutes." });
      } catch (err) {
        await recordingStore.markStopped(args.sessionId, Date.now());
        fail(
          `Recording upload failed: ${err instanceof Error ? err.message : "unknown error"}. It's saved on this device — open the meeting to retry.`,
        );
      } finally {
        setStatus("idle");
        setMeetingId(null);
        setStartedAt(null);
        await refreshRecoverable();
      }
    },
    [fail, queryClient, refreshRecoverable],
  );

  const finalizeLive = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    releaseHardware();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!session) {
      setStatus("idle");
      setMeetingId(null);
      setStartedAt(null);
      return;
    }
    const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
    if (chunks.length === 0) {
      await recordingStore.deleteSession(session.id);
      setStatus("idle");
      setMeetingId(null);
      setStartedAt(null);
      await refreshRecoverable();
      return;
    }
    await uploadAndRegister({
      sessionId: session.id,
      meetingId: session.meetingId,
      file: buildFile(chunks, session.mime),
      durationSeconds,
    });
  }, [releaseHardware, refreshRecoverable, uploadAndRegister]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !sessionRef.current) return;
    // A second stop() on an inactive recorder throws InvalidStateError.
    if (recorder.state === "inactive") return;
    await new Promise<void>((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const start = useCallback(
    async (targetMeetingId: string) => {
      if (startingRef.current || statusRef.current !== "idle" || sessionRef.current || recorderRef.current) return;
      startingRef.current = true;
      try {
        setError(null);
        const mime = pickRecordingMime();
        if (!mime) {
          fail("This browser can't record audio — try Chrome, Edge or Safari.");
          return;
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          fail(describeMicError(err));
          return;
        }

        const session = { id: crypto.randomUUID(), meetingId: targetMeetingId, mime, startedAt: Date.now() };
        sessionRef.current = session;
        chunksRef.current = [];
        try {
          await recordingStore.createSession({ id: session.id, meetingId: targetMeetingId, mimeType: mime, startedAt: session.startedAt });
        } catch (err) {
          sessionRef.current = null;
          stream.getTracks().forEach((t) => t.stop());
          fail(`Couldn't prepare local storage for the recording: ${err instanceof Error ? err.message : "unknown error"}`);
          return;
        }

        const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
        let index = 0;
        recorder.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          chunksRef.current.push(e.data);
          recordingStore.appendChunk(session.id, index++, e.data, Date.now()).catch(() => {
            /* memory copy still uploads on Stop */
          });
        };
        recorder.onstop = () => {
          void finalizeLive()
            .catch((err) => {
              fail(
                `Could not finish the recording: ${err instanceof Error ? err.message : "unknown error"}. Open the meeting to retry from what was saved.`,
              );
              setStatus("idle");
              setMeetingId(null);
              setStartedAt(null);
            })
            .finally(() => {
              stopResolveRef.current?.();
              stopResolveRef.current = null;
            });
        };
        const cutShort = () => {
          // onerror and the track's `ended` can BOTH fire; only act once.
          if (recorderRef.current !== recorder || recorder.state === "inactive") return;
          fail("The microphone stopped — recording was cut short. Uploading what was captured.");
          recorder.stop();
        };
        recorder.onerror = cutShort;
        stream.getAudioTracks().forEach((t) => {
          t.onended = cutShort;
        });

        recorderRef.current = recorder;
        streamRef.current = stream;
        recorder.start(TIMESLICE_MS);
        setMeetingId(targetMeetingId);
        setStartedAt(session.startedAt);
        setStatus("recording");
        await refreshRecoverable();
      } finally {
        startingRef.current = false;
      }
    },
    [fail, finalizeLive, refreshRecoverable],
  );

  const uploadRecoverable = useCallback(
    async (sessionId: string) => {
      // uploadAndRegister owns status/meetingId; running it under a live
      // session would hide the REC pill and orphan the recorder refs.
      if (sessionRef.current) {
        fail("Stop the current recording before uploading an earlier one.");
        return;
      }
      const session = (await recordingStore.listSessions()).find((s) => s.id === sessionId);
      if (!session) {
        await refreshRecoverable();
        return;
      }
      const chunks = await recordingStore.getChunks(sessionId);
      if (chunks.length === 0) {
        await recordingStore.deleteSession(sessionId);
        await refreshRecoverable();
        return;
      }
      await uploadAndRegister({
        sessionId,
        meetingId: session.meetingId,
        file: buildFile(chunks, session.mimeType),
        durationSeconds: Math.max(1, Math.round((session.updatedAt - session.startedAt) / 1000)),
      });
    },
    [fail, refreshRecoverable, uploadAndRegister],
  );

  const discardRecoverable = useCallback(
    async (sessionId: string) => {
      await recordingStore.deleteSession(sessionId);
      await refreshRecoverable();
    },
    [refreshRecoverable],
  );

  // A refresh still stops the mic (the stream dies with the page) — warn.
  useEffect(() => {
    if (status !== "recording") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // Nothing below the provider can unmount it, but the provider itself can
  // go (client-side navigation out of the dashboard layout). Never leave the
  // mic live behind an unmounted tree.
  useEffect(() => () => {
    releaseHardware();
  }, [releaseHardware]);

  const value = useMemo<MeetingRecorderContextValue>(
    () => ({ status, meetingId, startedAt, error, start, stop, recoverable, uploadRecoverable, discardRecoverable }),
    [status, meetingId, startedAt, error, start, stop, recoverable, uploadRecoverable, discardRecoverable],
  );

  return <MeetingRecorderContext.Provider value={value}>{children}</MeetingRecorderContext.Provider>;
}
```

Notes for the implementer:
- `crypto.randomUUID` exists in jsdom ≥ 20 and all target browsers.
- The `status !== "idle"` guard in `start` reads React state; the `sessionRef` check is the real re-entrancy guard.
- Do not add `console.*` calls.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx`
Expected: 7 passed. If the "dropped microphone" test hangs, check that `cutShort` calls `recorder.stop()` (the fake's `stop` invokes `onstop` synchronously).

- [ ] **Step 5: Commit**

```bash
git add src/components/meetings/MeetingRecorderProvider.tsx src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx
git commit -m "feat(recorder): layout-level MeetingRecorderProvider — survives navigation, persists chunks, recovers orphans"
```

### Task 4: `RecordingIndicator` — the floating REC pill

**Files:**
- Create: `src/components/meetings/RecordingIndicator.tsx`
- Test: `src/__tests__/components/meetings/RecordingIndicator.test.tsx`

Renders nothing when idle. `formatElapsed(seconds)` (`mm:ss`) is a pure helper in `src/lib/recording-capture.ts`, shared with `ActiveMeetingView`'s REC button; the pill derives its own mm:ss from `useElapsedSeconds(startedAt)` — the context never carries a ticking number. While recording: fixed pill (bottom-right above the feedback bubble on desktop, above the mobile tab bar on phones) with a pulsing dot, `REC mm:ss`, a **Stop** button, and — when the current path is not `/meetings` — a "Back to meeting" link to `/meetings`. While uploading: "Uploading recording…" with a spinner and no Stop.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/components/meetings/RecordingIndicator.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

const usePathname = vi.fn(() => "/todos");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

const ctx = {
  status: "idle" as "idle" | "recording" | "uploading",
  meetingId: null as string | null,
  startedAt: null as number | null,
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
  recoverable: [],
  uploadRecoverable: vi.fn(),
  discardRecoverable: vi.fn(),
};
// Only the context is faked — the real useElapsedSeconds runs so the pill's
// timer is exercised against a fixed clock.
vi.mock("@/components/meetings/MeetingRecorderProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/meetings/MeetingRecorderProvider")>()),
  useMeetingRecorder: () => ctx,
}));

import { RecordingIndicator } from "@/components/meetings/RecordingIndicator";

describe("RecordingIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
    ctx.status = "idle";
    ctx.startedAt = null;
    ctx.stop.mockReset();
    usePathname.mockReturnValue("/todos");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while idle", () => {
    const { container } = render(<RecordingIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows elapsed time, Stop, and a back link away from the meetings page", () => {
    ctx.status = "recording";
    ctx.startedAt = Date.now() - 754_000;
    render(<RecordingIndicator />);
    expect(screen.getByText("REC 12:34")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    expect(ctx.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /back to meeting/i })).toHaveAttribute("href", "/meetings");
  });

  it("hides the back link on the meetings page", () => {
    ctx.status = "recording";
    usePathname.mockReturnValue("/meetings");
    render(<RecordingIndicator />);
    expect(screen.queryByRole("link", { name: /back to meeting/i })).not.toBeInTheDocument();
  });

  it("ticks the pill once a second without the context changing", () => {
    ctx.status = "recording";
    ctx.startedAt = Date.now() - 754_000;
    render(<RecordingIndicator />);
    expect(screen.getByText("REC 12:34")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByText("REC 12:36")).toBeInTheDocument();
  });

  it("shows an uploading state without a Stop button", () => {
    ctx.status = "uploading";
    render(<RecordingIndicator />);
    expect(screen.getByText(/uploading recording/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop recording/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/meetings/RecordingIndicator.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/meetings/RecordingIndicator.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatElapsed } from "@/lib/recording-capture";
import { useElapsedSeconds, useMeetingRecorder } from "./MeetingRecorderProvider";

/**
 * Always-visible recording state (Recorder v2). Mounted by the dashboard
 * layout so it follows the user to every page; the recorder itself lives
 * in MeetingRecorderProvider and does not care where the user is.
 */
export function RecordingIndicator() {
  const { status, startedAt, stop } = useMeetingRecorder();
  // The once-a-second tick lives here, not in the provider, so the layout
  // shell and the other consumers don't re-render for 90 minutes.
  const elapsedSeconds = useElapsedSeconds(startedAt);
  const pathname = usePathname();
  if (status === "idle") return null;

  const onMeetingsPage = pathname === "/meetings";

  return (
    <div className="fixed z-50 right-6 bottom-36 md:bottom-20 flex items-center gap-2 rounded-full border border-border bg-card shadow-lg pl-3 pr-2 py-1.5">
      {/* One announcement per state change — the ticking timer itself is
          hidden from assistive tech so it isn't re-read every second. */}
      <span className="sr-only" role="status">
        {status === "recording" ? "Recording in progress" : "Uploading recording"}
      </span>
      {status === "recording" ? (
        <>
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
          </span>
          <span className="text-xs font-semibold tabular-nums text-foreground" aria-hidden="true">
            REC {formatElapsed(elapsedSeconds)}
          </span>
          {!onMeetingsPage && (
            <Link href="/meetings" className="text-xs text-brand hover:underline">
              Back to meeting
            </Link>
          )}
          <Button
            variant="destructive"
            size="xs"
            onClick={() => void stop()}
            aria-label="Stop recording"
            iconLeft={<Square className="w-3 h-3" />}
          >
            Stop
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" aria-hidden="true" />
          <span className="text-xs text-muted">Uploading recording…</span>
        </>
      )}
    </div>
  );
}
```

Check `Button` supports `size="xs"` and `iconLeft` (it is used that way in `MeetingAiReviewPanel.tsx`). The red dot is a status colour, not a surface — `bg-red-500/600` is acceptable here (same as the v1 REC button used `bg-white` on a destructive button); if `design-token-rails` flags it, switch to `bg-destructive`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/components/meetings/RecordingIndicator.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/meetings/RecordingIndicator.tsx src/__tests__/components/meetings/RecordingIndicator.test.tsx
git commit -m "feat(recorder): floating REC indicator with Stop and back-to-meeting link"
```

---

## Chunk 3: Wiring, cleanup, verification

### Task 5: Wire the meeting view to the provider; auto-stop on completion; recovery banner; delete v1 hook

**Files:**
- Create: `src/components/meetings/RecordingRecoveryBanner.tsx`
- Modify: `src/components/meetings/ActiveMeetingView.tsx` (imports ~L49-51, recorder block ~L98-125, error effect ~L500-507, header buttons ~L546-576, `handleComplete` ~L306-330, panel ~L1037)
- Delete: `src/hooks/useMeetingRecorder.ts`
- Test: extend `src/__tests__/components/meetings/RecordingIndicator.test.tsx`? No — add `src/__tests__/components/meetings/RecordingRecoveryBanner.test.tsx`

- [ ] **Step 1: Write the failing banner test**

```tsx
// src/__tests__/components/meetings/RecordingRecoveryBanner.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const ctx = {
  status: "idle" as "idle" | "recording" | "uploading",
  meetingId: null,
  startedAt: null,
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
  recoverable: [] as { sessionId: string; meetingId: string; startedAt: number; updatedAt: number; chunkCount: number }[],
  uploadRecoverable: vi.fn(),
  discardRecoverable: vi.fn(),
};
vi.mock("@/components/meetings/MeetingRecorderProvider", () => ({ useMeetingRecorder: () => ctx }));

import { RecordingRecoveryBanner } from "@/components/meetings/RecordingRecoveryBanner";

describe("RecordingRecoveryBanner", () => {
  beforeEach(() => {
    ctx.recoverable = [];
    ctx.uploadRecoverable.mockReset();
    ctx.discardRecoverable.mockReset();
  });

  it("renders nothing when this meeting has no orphaned recording", () => {
    ctx.recoverable = [{ sessionId: "s", meetingId: "other", startedAt: 0, updatedAt: 60_000, chunkCount: 2 }];
    const { container } = render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Upload and Discard for this meeting's orphan", () => {
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 125_000, chunkCount: 4 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(screen.getByText(/unfinished recording/i)).toBeInTheDocument();
    expect(screen.getByText(/2 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(ctx.uploadRecoverable).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(ctx.discardRecoverable).toHaveBeenCalledWith("s1");
  });

  it("disables Upload while a recording is live", () => {
    ctx.status = "recording";
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 5_000, chunkCount: 1 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
    ctx.status = "idle";
  });

  it("hides the actions for users who cannot manage recordings", () => {
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 5_000, chunkCount: 1 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/components/meetings/RecordingRecoveryBanner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the banner**

```tsx
// src/components/meetings/RecordingRecoveryBanner.tsx
"use client";

import { AlertTriangle, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMeetingRecorder } from "./MeetingRecorderProvider";

/**
 * "We found an unfinished recording for this meeting" (Recorder v2). Shows
 * when IndexedDB holds chunks for this meeting that never reached the
 * server — a crash, a refresh, or a failed upload.
 */
export function RecordingRecoveryBanner({
  meetingId,
  canManage,
}: {
  meetingId: string;
  canManage: boolean;
}) {
  const { recoverable, uploadRecoverable, discardRecoverable, status } = useMeetingRecorder();
  const orphans = recoverable.filter((r) => r.meetingId === meetingId);
  if (orphans.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {orphans.map((r) => {
        const minutes = Math.max(1, Math.round((r.updatedAt - r.startedAt) / 60_000));
        return (
          <div
            key={r.sessionId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-foreground flex-1 min-w-[12rem]">
              <span className="font-medium">Unfinished recording found</span> — about {minutes} min
              captured on this device ({new Date(r.startedAt).toLocaleString("en-AU")}) that never
              reached the server.
            </p>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  onClick={() => void uploadRecoverable(r.sessionId)}
                  loading={status === "uploading"}
                  disabled={status !== "idle"}
                  title={status === "recording" ? "Stop the current recording first" : undefined}
                  iconLeft={<Upload className="w-3.5 h-3.5" />}
                >
                  Upload
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void discardRecoverable(r.sessionId)}
                  iconLeft={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Discard
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify the banner test passes**

Run: `npx vitest run src/__tests__/components/meetings/RecordingRecoveryBanner.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Rewire `ActiveMeetingView.tsx`**

1. Replace the three imports at ~L49-51 (`useMeetingRecorder` from `@/hooks/...`, `useCreateRecording`, `uploadFileSmart`) with:
   ```tsx
   import { useMeetingRecorder } from "./MeetingRecorderProvider";
   import { RecordingRecoveryBanner } from "./RecordingRecoveryBanner";
   ```
   Grep the file first: if `useCreateRecording`/`uploadFileSmart` have no other callers in it, drop them. Also remove `useEffect` from the `react` import on L3 IF the only `useEffect` call in the file is the mic-error effect you delete in step 3 (grep `useEffect(` to confirm) — an unused import fails lint. Keep `toast`, `Square`, `Mic`.
2. Replace the block from `const createRecording = useCreateRecording(meeting.id);` through the closing `});` of `useMeetingRecorder({ onRecorded: ... })` (~L107-125) with:
   ```tsx
   const recorder = useMeetingRecorder();
   const isRecordingThisMeeting =
     recorder.status === "recording" && recorder.meetingId === meeting.id;
   ```
3. Delete the "Surface mic-permission … errors as toasts" `useEffect` (~L500-507) — the provider toasts already.
4. In the header controls (~L546-576) make exactly these substitutions, keeping all other JSX as-is:
   - `recorder.isRecording ? (` → `isRecordingThisMeeting ? (`
   - `onClick={recorder.stop}` → `onClick={() => void recorder.stop()}`
   - `recorder.elapsedSeconds` is GONE from the context. Add `const recorderElapsedSeconds = useElapsedSeconds(recorder.startedAt);` next to `useMeetingRecorder()` and render `REC {formatElapsed(recorderElapsedSeconds)}` (import `formatElapsed` from `@/lib/recording-capture`, `useElapsedSeconds` from the provider) instead of the inline `padStart` maths.
   - The Record branch `) : (` → `) : recorder.status === "idle" ? (` and its closing `)` before the outer `)}` becomes `) : null`.
   - `onClick={() => recorder.start()}` → `onClick={() => void recorder.start(meeting.id)}`
   Result shape: `{!isCompleted && canRecord && (isRecordingThisMeeting ? (<REC button/>) : recorder.status === "idle" ? (<Record button/>) : null)}`.
5. In `handleComplete` (~L306-330) add to the `updateMeeting.mutate` options:
   ```tsx
   onSuccess: () => {
     // Completing the meeting ends the recording — never the other way round.
     if (isRecordingThisMeeting) void recorder.stop();
   },
   ```
   and add `isRecordingThisMeeting, recorder` to the `useCallback` deps.
6. Render `<RecordingRecoveryBanner meetingId={meeting.id} canManage={canRecord} />` directly above `<MeetingAiReviewPanel …>` (~L1037).
7. `git rm src/hooks/useMeetingRecorder.ts`.

- [ ] **Step 6: Verify nothing else imports the old hook, typecheck, lint**

Run:
```bash
grep -rn "useMeetingRecorder\"" src --include="*.ts" --include="*.tsx" | grep -v MeetingRecorderProvider
npx tsc --noEmit 2>&1 | grep -E "ActiveMeetingView|MeetingRecorder|Recording" ; echo "tsc filtered exit done"
npx eslint src/components/meetings/ActiveMeetingView.tsx src/components/meetings/MeetingRecorderProvider.tsx src/components/meetings/RecordingIndicator.tsx src/components/meetings/RecordingRecoveryBanner.tsx src/lib/recording-store.ts src/lib/recording-capture.ts
```
Expected: grep prints nothing; tsc prints nothing for these files; eslint reports 0 errors (warnings acceptable only if pre-existing patterns).

- [ ] **Step 7: Run the meetings test folder**

Run: `npx vitest run src/__tests__/components/meetings src/__tests__/lib/recording-store.test.ts src/__tests__/lib/recording-capture.test.ts`
Expected: all passed.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/meetings src/hooks src/__tests__/components/meetings
git commit -m "feat(meetings): recorder v2 wiring — provider-backed Record/Stop, auto-stop on completion, orphan recovery banner; drop v1 hook"
```

### Task 6: Mount in the layout, document, verify, PR

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `CLAUDE.md` (repo) — Meetings section note
- Modify: `docs/superpowers/plans/2026-08-31-eos-recording-ai-phase2.md` — one-line pointer at the top: "Superseded on the client side by 2026-09-14-meeting-recorder-v2.md".

- [ ] **Step 1: Mount the provider and indicator**

In `src/app/(dashboard)/layout.tsx`:
- Import `MeetingRecorderProvider` and `RecordingIndicator` from `@/components/meetings/...`.
- Wrap `<DashboardLayoutInner>` inside `QuickAddProvider` with `<MeetingRecorderProvider>…</MeetingRecorderProvider>` (it uses `useQueryClient`, and the QueryProvider is in the root layout, so this is fine).
- Render `<RecordingIndicator />` right after `<FloatingChatWidget />` with a comment: `{/* 2026-09-14: recorder v2 — REC pill follows the user across pages */}`.

- [ ] **Step 2: Document**

Append to the repo `CLAUDE.md` Meetings/EOS area (find the section mentioning `MeetingAiReviewPanel` or add under "Key Conventions"):

```
- **Meeting recorder v2 (2026-09-14)**: the MediaRecorder lives in `MeetingRecorderProvider` (mounted in the dashboard layout), NOT in the meeting page — v1 lost the first real L10 because any sidebar click unmounted it. Chunks persist to IndexedDB (`src/lib/recording-store.ts`) every 30 s; Stop / meeting completion / a dead mic end a session and upload through the unchanged `POST /api/meetings/[id]/recordings` path. Orphans surface via `RecordingRecoveryBanner`. `RecordingIndicator` is the always-visible REC pill. Never move recording state back below routing.
```

- [ ] **Step 3: Full verification gate**

Run, in order:
```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```
Expected: tsc clean; lint 0 errors; all tests pass (count ≥ previous main); build succeeds. Fix anything that fails before continuing.

- [ ] **Step 4: Manual smoke in the browser (preview tools)**

Start the dev server from the worktree (`.claude/launch.json` config or `npx next dev -p 3123` after `npm ci` if the node_modules symlink upsets Turbopack), sign in as the seeded admin, open `/meetings`, start a meeting, click Record, confirm the REC pill; navigate to `/todos` — pill still counting; back to `/meetings` → resume the meeting → Stop → toast "Recording uploaded" (Deepgram keys are absent locally, so the row will read `failed` with "not configured" — that is the server pipeline, not the recorder, and is fine). Screenshot the pill on `/todos` for the PR.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add -A
git commit -m "feat(meetings): mount recorder v2 in the dashboard layout + docs"
git push -u origin feat/meeting-recorder-v2
gh pr create --base main --title "feat(meetings): recorder v2 — survives navigation, persists chunks, recovers orphans" --body "<summary of the four behaviours + why + verification>"
```

Do NOT merge — Jayden merges by saying "merge <n>".
