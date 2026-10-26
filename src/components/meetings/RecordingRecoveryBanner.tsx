// src/components/meetings/RecordingRecoveryBanner.tsx
"use client";

import { AlertTriangle, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { externalAiProcessingAllowed } from "@/lib/ai-privacy-policy";
import { SERVICE_TZ } from "@/lib/timezone";
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
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState(false);
  const aiAllowed = externalAiProcessingAllowed();
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
              captured on this device ({new Date(r.startedAt).toLocaleString("en-AU", { timeZone: SERVICE_TZ })}) that never
              reached the server.
              {!aiAllowed && <span className="mt-1 block">Uploading for transcription is paused for privacy. This recording remains on this device. You can add written notes below.</span>}
            </p>
            {canManage && (
              <div className="flex items-center gap-2">
                {aiAllowed && <Button
                  onClick={() => void uploadRecoverable(r.sessionId)}
                  loading={status === "uploading"}
                  disabled={status !== "idle"}
                  title={status === "recording" ? "Stop the current recording first" : undefined}
                  iconLeft={<Upload className="w-3.5 h-3.5" />}
                >
                  Upload
                </Button>}
                <Button
                  variant="ghost"
                  disabled={status !== "idle"}
                  onClick={() => { setDiscardError(false); setDiscardId(r.sessionId); }}
                  iconLeft={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete from this device
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <ConfirmDialog
        open={!!discardId}
        onOpenChange={open => { if (!open && !discarding) setDiscardId(null); }}
        title="Delete this unfinished recording?"
        description="This recording was never saved to the dashboard. Deleting it removes the copy on this device and cannot be undone. Keep it if you still need to refer to it."
        warning={discardError ? "We couldn’t delete the recording. Please try again." : undefined}
        confirmLabel="Delete recording"
        loading={discarding}
        onConfirm={() => {
          if (!discardId || discarding) return;
          setDiscarding(true);
          void Promise.resolve().then(() => discardRecoverable(discardId)).then(() => setDiscardId(null)).catch(() => setDiscardError(true)).finally(() => setDiscarding(false));
        }}
      />
    </div>
  );
}
