// src/__tests__/components/meetings/MeetingRecorderProvider.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

const uploadFileSmart = vi.fn();
const mutateApi = vi.fn();
const toast = vi.fn();
vi.mock("@/lib/upload-client", () => ({ uploadFileSmart: (...a: unknown[]) => uploadFileSmart(...a) }));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: (...a: unknown[]) => mutateApi(...a), fetchApi: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { recordingStore } from "@/lib/recording-store";
import {
  LIVE_SESSION_GRACE_MS,
  MeetingRecorderProvider,
  useElapsedSeconds,
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

// A fresh QueryClient + provider per render — the hook tests only need an
// isolated provider each. Test 1 below builds its own tree instead so it can
// rerender the SAME provider with the consumer toggled off.
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
// Assigned from an effect (not during render) to satisfy react-hooks/globals;
// render/rerender/act all flush effects, so `latest` is current when read.
let latest: ReturnType<typeof useMeetingRecorder> | null = null;
function Probe() {
  const ctx = useMeetingRecorder();
  useEffect(() => {
    latest = ctx;
  });
  return null;
}

describe("MeetingRecorderProvider", () => {
  let stream: ReturnType<typeof makeStream>;

  beforeEach(async () => {
    // shouldAdvanceTime is REQUIRED: without it `waitFor` never yields to the
    // microtask queue and the async tests hang (see InstallBanner.test.tsx).
    // setImmediate must stay REAL: fake-indexeddb (and jsdom's FileReader)
    // schedule on it, and sinon's fake setImmediate fires queued tasks in one
    // synchronous loop, so a transaction auto-commits before the `await`ed
    // request continuation runs (InvalidStateError inside appendChunk).
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
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
    expect(latest!.startedAt).toBeNull();
    await act(async () => { await latest!.start("m1"); });
    expect(latest!.status).toBe("recording");
    expect(latest!.meetingId).toBe("m1");
    expect(typeof latest!.startedAt).toBe("number");

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
    expect(result.current.startedAt).toBeNull();
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

  it("releases the mic and stays idle when local storage fails on start, then can start again", async () => {
    const createSession = vi.spyOn(recordingStore, "createSession").mockRejectedValueOnce(new Error("quota"));
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/local storage/);
    expect(stream.track.stop).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringContaining("quota") }));

    await act(async () => { await result.current.start("m1"); });
    expect(result.current.status).toBe("recording");
    expect(result.current.meetingId).toBe("m1");
    createSession.mockRestore();
  });

  it("registers a beforeunload guard while recording and removes it after stop", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    expect(add).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    await act(async () => { await result.current.start("m1"); });
    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const handler = add.mock.calls.find(([type]) => type === "beforeunload")?.[1];

    await act(async () => { FakeMediaRecorder.instances[0].emit("aa"); });
    await act(async () => { await result.current.stop(); });
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(remove).toHaveBeenCalledWith("beforeunload", handler);
    add.mockRestore();
    remove.mockRestore();
  });

  it("refuses to upload an orphan while a live session exists", async () => {
    await recordingStore.createSession({ id: "orphan", meetingId: "m9", mimeType: "audio/webm", startedAt: 1_000 });
    await recordingStore.appendChunk("orphan", 0, new Blob(["zz"]), 61_000);
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(result.current.recoverable).toHaveLength(1));

    await act(async () => { await result.current.start("m1"); });
    expect(result.current.status).toBe("recording");
    await act(async () => { await result.current.uploadRecoverable("orphan"); });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringMatching(/stop the current recording/i) }));
    expect(uploadFileSmart).not.toHaveBeenCalled();
    expect(result.current.status).toBe("recording");
    expect(result.current.recoverable).toHaveLength(1);
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

  it("ignores a second start while the permission prompt is still open", async () => {
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    const p1 = result.current.start("m1");
    const p2 = result.current.start("m1");
    await act(async () => { await Promise.all([p1, p2]); });
    expect(result.current.status).toBe("recording");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(await recordingStore.listSessions()).toHaveLength(1);
  });

  it("still uploads the in-memory chunk when persisting it to IndexedDB fails", async () => {
    const appendChunk = vi.spyOn(recordingStore, "appendChunk").mockRejectedValueOnce(new Error("idb"));
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    await act(async () => { FakeMediaRecorder.instances[0].emit("aa"); });
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(appendChunk).toHaveBeenCalledTimes(1);
    expect(uploadFileSmart).toHaveBeenCalledTimes(1);
    const [file] = uploadFileSmart.mock.calls[0] as [File];
    expect(await readBlobText(file)).toBe("aa");
    appendChunk.mockRestore();
  });

  it("settles recoverable to [] when listing sessions fails on mount", async () => {
    const listSessions = vi.spyOn(recordingStore, "listSessions").mockRejectedValueOnce(new Error("idb"));
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(listSessions).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.recoverable).toEqual([]);
    expect(result.current.status).toBe("idle");
    listSessions.mockRestore();
  });

  it("drops an orphan that another tab already deleted instead of uploading it", async () => {
    await recordingStore.createSession({ id: "orphan", meetingId: "m9", mimeType: "audio/webm", startedAt: 1_000 });
    await recordingStore.appendChunk("orphan", 0, new Blob(["zz"]), 61_000);
    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(result.current.recoverable).toHaveLength(1));

    await recordingStore.deleteSession("orphan");
    await act(async () => { await result.current.uploadRecoverable("orphan"); });
    expect(uploadFileSmart).not.toHaveBeenCalled();
    expect(mutateApi).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.recoverable).toEqual([]));
  });

  it("releases the microphone when the provider itself unmounts mid-recording", async () => {
    const { result, unmount } = renderHook(() => useMeetingRecorder(), { wrapper });
    await act(async () => { await result.current.start("m1"); });
    expect(stream.track.stop).not.toHaveBeenCalled();
    unmount();
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it("never lists a session another tab is still recording; stale or stopped ones are recoverable", async () => {
    const now = Date.now();
    await recordingStore.createSession({ id: "live-elsewhere", meetingId: "m9", mimeType: "audio/webm", startedAt: now - 60_000 });
    await recordingStore.appendChunk("live-elsewhere", 0, new Blob(["zz"]), now - 10_000);
    await recordingStore.createSession({ id: "dead-tab", meetingId: "m9", mimeType: "audio/webm", startedAt: now - 300_000 });
    await recordingStore.appendChunk("dead-tab", 0, new Blob(["zz"]), now - LIVE_SESSION_GRACE_MS - 30_000);
    await recordingStore.createSession({ id: "failed-upload", meetingId: "m9", mimeType: "audio/webm", startedAt: now - 60_000 });
    await recordingStore.appendChunk("failed-upload", 0, new Blob(["zz"]), now - 5_000);
    await recordingStore.markStopped("failed-upload", now - 1_000);

    const { result } = renderHook(() => useMeetingRecorder(), { wrapper });
    await waitFor(() => expect(result.current.recoverable).toHaveLength(2));
    const ids = result.current.recoverable.map((r) => r.sessionId).sort();
    expect(ids).toEqual(["dead-tab", "failed-upload"]);
  });

  it("useMeetingRecorder throws outside the provider", () => {
    expect(() => renderHook(() => useMeetingRecorder())).toThrow(/MeetingRecorderProvider/);
  });
});

describe("useElapsedSeconds", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks once a second from startedAt and stops when startedAt is null", () => {
    const { result, rerender } = renderHook(({ startedAt }) => useElapsedSeconds(startedAt), {
      initialProps: { startedAt: Date.now() as number | null },
    });
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current).toBe(3);

    rerender({ startedAt: null });
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(0);
  });

  it("starts from the real elapsed time, not zero, when mounted mid-session", () => {
    const { result } = renderHook(() => useElapsedSeconds(Date.now() - 754_000));
    expect(result.current).toBe(754);
  });
});
