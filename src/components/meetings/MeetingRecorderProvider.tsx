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
  elapsedSeconds: number;
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<RecoverableRecording[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<{ id: string; meetingId: string; mime: string; startedAt: number } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    setRecoverable(sessions.filter((s) => s.id !== liveId).map(toRecoverable));
  }, []);

  useEffect(() => {
    refreshRecoverable().catch(() => setRecoverable([]));
  }, [refreshRecoverable]);

  const fail = useCallback((message: string) => {
    setError(message);
    toast({ variant: "destructive", description: message });
  }, []);

  const releaseHardware = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
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
        setElapsedSeconds(0);
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
      return;
    }
    const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
    if (chunks.length === 0) {
      await recordingStore.deleteSession(session.id);
      setStatus("idle");
      setMeetingId(null);
      setElapsedSeconds(0);
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
        setElapsedSeconds(0);
        setStatus("recording");
        tickRef.current = setInterval(() => {
          setElapsedSeconds(Math.round((Date.now() - session.startedAt) / 1000));
        }, 1000);
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

  const value = useMemo<MeetingRecorderContextValue>(
    () => ({ status, meetingId, elapsedSeconds, error, start, stop, recoverable, uploadRecoverable, discardRecoverable }),
    [status, meetingId, elapsedSeconds, error, start, stop, recoverable, uploadRecoverable, discardRecoverable],
  );

  return <MeetingRecorderContext.Provider value={value}>{children}</MeetingRecorderContext.Provider>;
}
