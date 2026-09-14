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
