"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser mic capture for L10 meetings (Phase 2, 2026-08-31).
 *
 * MediaRecorder at ~32 kbps opus — a 90-minute meeting is ~22 MB. Chunks
 * are buffered in memory (timeslice 30 s) and assembled into one File on
 * stop. A page refresh loses the buffer — the beforeunload guard warns,
 * and the UI copy sets that expectation.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari
];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function extensionFor(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

export function useMeetingRecorder({
  onRecorded,
}: {
  onRecorded: (file: File, durationSeconds: number) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  // Set on unmount: track-stop fires onstop asynchronously, which would
  // otherwise upload a partial recording after in-app navigation.
  const disposedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const mime = pickMime();
    if (!mime) {
      setError("This browser can't record audio — try Chrome, Edge or Safari.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone access was blocked. Allow the mic in your browser's site settings, then try again.",
      );
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 32_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (disposedRef.current) {
        cleanup();
        return;
      }
      const durationSeconds = Math.round(
        (Date.now() - startedAtRef.current) / 1000,
      );
      const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
      chunksRef.current = [];
      cleanup();
      setIsRecording(false);
      if (blob.size > 0) {
        const file = new File(
          [blob],
          `l10-recording-${Date.now()}.${extensionFor(mime)}`,
          { type: mime.split(";")[0] },
        );
        onRecorded(file, durationSeconds);
      }
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    recorder.start(30_000);
    setIsRecording(true);
    tickRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
  }, [cleanup, onRecorded]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  // Buffered audio is lost on navigation — warn while recording.
  useEffect(() => {
    if (!isRecording) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRecording]);

  useEffect(
    () => () => {
      disposedRef.current = true;
      cleanup();
    },
    [cleanup],
  );

  return { isRecording, elapsedSeconds, error, start, stop };
}
