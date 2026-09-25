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
