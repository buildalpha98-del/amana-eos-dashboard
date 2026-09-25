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
