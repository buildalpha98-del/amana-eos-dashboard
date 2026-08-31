"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useActionItemDecision,
  useCreateRecording,
  useMeetingRecordings,
  useMissedItemDecision,
  useRegenerateReview,
  type MeetingRecordingData,
} from "@/hooks/useMeetingRecordings";
import type { MeetingAttendee } from "@/hooks/useMeetings";
import type {
  MeetingAiActionItem,
  MeetingAiMissedItem,
} from "@/lib/meeting-review";
import { uploadFileSmart } from "@/lib/upload-client";
import { RECORDING_ALLOWED_MIMES } from "@/lib/upload-strategy";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MeetingRecordingData["status"], string> = {
  uploaded: "Uploaded",
  transcribing: "Transcribing…",
  transcribed: "Summarising…",
  complete: "AI review ready",
  failed: "Failed",
};

const MISSED_KIND_LABEL: Record<MeetingAiMissedItem["kind"], string> = {
  uncaptured_issue: "Discussed but never captured as an Issue",
  unowned_commitment: "Commitment with no clear owner",
  unstatused_rock: "Rock mentioned but not statused",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export function MeetingAiReviewPanel({
  meetingId,
  attendees,
  users,
  canManage,
}: {
  meetingId: string;
  attendees?: MeetingAttendee[];
  users?: { id: string; name: string }[];
  /** Whether the current user can upload/regenerate/decide (meeting roles). */
  canManage: boolean;
}) {
  const { data: recordings } = useMeetingRecordings(meetingId);
  const createRecording = useCreateRecording(meetingId);
  const regenerate = useRegenerateReview(meetingId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadFileSmart(file, { context: "recording" });
      createRecording.mutate({ url: result.fileUrl, source: "upload" });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!recordings?.length && !canManage) return null;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 bg-purple-50/50 dark:bg-purple-950/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <h3 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wider">
            AI Meeting Review
          </h3>
        </div>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={RECORDING_ALLOWED_MIMES.join(",")}
              className="hidden"
              aria-label="Upload a meeting recording"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading || createRecording.isPending}
              iconLeft={<Upload className="w-3.5 h-3.5" />}
            >
              Upload recording
            </Button>
          </>
        )}
      </div>

      {!recordings?.length ? (
        <p className="p-4 text-xs text-muted">
          No recordings yet. Record the meeting live, or upload a Teams/Zoom
          file — you&apos;ll get a summary, action items and anything the
          room may have missed. Audio is deleted after transcription.
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {recordings.map((rec) => (
            <RecordingSection
              key={rec.id}
              meetingId={meetingId}
              recording={rec}
              attendees={attendees}
              users={users}
              canManage={canManage}
              onRegenerate={() => regenerate.mutate(rec.id)}
              regenerating={regenerate.isPending && regenerate.variables === rec.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingSection({
  meetingId,
  recording,
  attendees,
  users,
  canManage,
  onRegenerate,
  regenerating,
}: {
  meetingId: string;
  recording: MeetingRecordingData;
  attendees?: MeetingAttendee[];
  users?: { id: string; name: string }[];
  canManage: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const review = recording.aiReview;
  const processing = ["uploaded", "transcribing", "transcribed"].includes(
    recording.status,
  );

  return (
    <div className="p-4 space-y-4">
      {/* Status strip */}
      <div className="flex items-center gap-2 text-xs">
        <FileAudio className="w-3.5 h-3.5 text-muted flex-shrink-0" />
        <span className="text-muted">
          {recording.source === "live_mic" ? "Live recording" : "Uploaded file"}
          {recording.durationSeconds
            ? ` · ${formatDuration(recording.durationSeconds)}`
            : ""}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full font-medium",
            recording.status === "complete"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
              : recording.status === "failed"
                ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
          )}
        >
          {STATUS_LABEL[recording.status]}
        </span>
        {processing && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
        {recording.status === "failed" && canManage && recording.transcriptText && (
          <Button variant="ghost" size="xs" onClick={onRegenerate} loading={regenerating}>
            Retry
          </Button>
        )}
        {recording.status === "complete" && canManage && (
          <Button variant="ghost" size="xs" onClick={onRegenerate} loading={regenerating}>
            Regenerate
          </Button>
        )}
      </div>

      {recording.status === "failed" && recording.error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {recording.error}
        </p>
      )}

      {review && recording.status === "complete" && (
        <>
          {/* Summary */}
          <div>
            <p className="text-2xs font-semibold text-muted uppercase tracking-wider mb-1">
              Summary
            </p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">
              {review.summary}
            </p>
          </div>

          {/* Decisions */}
          {review.decisions.length > 0 && (
            <div>
              <p className="text-2xs font-semibold text-muted uppercase tracking-wider mb-1">
                Decisions
              </p>
              <ul className="space-y-1.5">
                {review.decisions.map((d, i) => (
                  <li key={i} className="text-sm text-foreground/80">
                    {d.text}
                    {d.quote && (
                      <details className="inline ml-1">
                        <summary className="inline text-xs text-muted cursor-pointer">
                          source
                        </summary>
                        <span className="block text-xs text-muted italic mt-0.5">
                          “{d.quote}”
                        </span>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {review.actionItems.length > 0 && (
            <div>
              <p className="text-2xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Proposed action items
              </p>
              <div className="space-y-2">
                {review.actionItems.map((item) => (
                  <ActionItemRow
                    key={item.id}
                    meetingId={meetingId}
                    recordingId={recording.id}
                    item={item}
                    attendees={attendees}
                    users={users}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Missed items */}
          {review.missedItems.length > 0 && (
            <div>
              <p className="text-2xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5">
                Things you may have missed
              </p>
              <div className="space-y-2">
                {review.missedItems.map((item) => (
                  <MissedItemRow
                    key={item.id}
                    meetingId={meetingId}
                    recordingId={recording.id}
                    item={item}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {recording.transcriptText && (
            <details>
              <summary className="text-xs text-muted cursor-pointer hover:text-foreground">
                Transcript
              </summary>
              <pre className="mt-2 p-3 bg-surface/50 rounded-lg text-xs text-foreground/70 whitespace-pre-wrap max-h-80 overflow-y-auto font-sans">
                {substituteSpeakers(recording.transcriptText, review.speakerMap)}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function substituteSpeakers(
  text: string,
  speakerMap: { speaker: number; name: string | null; confidence: string }[],
): string {
  let out = text;
  for (const entry of speakerMap) {
    if (entry.confidence === "high" && entry.name) {
      out = out.replaceAll(`Speaker ${entry.speaker}:`, `${entry.name}:`);
    }
  }
  return out;
}

function ActionItemRow({
  meetingId,
  recordingId,
  item,
  attendees,
  users,
  canManage,
}: {
  meetingId: string;
  recordingId: string;
  item: MeetingAiActionItem;
  attendees?: MeetingAttendee[];
  users?: { id: string; name: string }[];
  canManage: boolean;
}) {
  const decide = useActionItemDecision(meetingId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [assigneeId, setAssigneeId] = useState(item.suggestedAssigneeUserId ?? "");
  const [dueDate, setDueDate] = useState(() => {
    if (item.suggestedDueDate) return item.suggestedDueDate;
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });

  const options = (() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const a of attendees ?? []) {
      if (!seen.has(a.userId)) {
        seen.add(a.userId);
        opts.push({ id: a.userId, name: a.user.name });
      }
    }
    for (const u of users ?? []) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        opts.push(u);
      }
    }
    return opts;
  })();

  if (item.status === "accepted") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span className="line-clamp-1">{item.title}</span>
        <span className="text-xs ml-auto flex-shrink-0">To-do created</span>
      </div>
    );
  }
  if (item.status === "dismissed") {
    return (
      <div className="px-3 py-2 rounded-lg bg-surface/50 text-sm text-muted line-through line-clamp-1">
        {item.title}
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5 rounded-lg border border-border space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{item.title}</p>
          <p className="text-xs text-muted mt-0.5">
            {item.suggestedAssigneeName ?? "No owner heard"}
            {item.suggestedDueDate ? ` · due ${item.suggestedDueDate}` : ""}
            {item.quote && (
              <span className="italic"> — “{item.quote}”</span>
            )}
          </p>
        </div>
        {canManage && !editing && (
          <div className="flex gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                decide.mutate({ recordingId, itemId: item.id, decision: "dismiss" })
              }
              disabled={decide.isPending}
            >
              Dismiss
            </Button>
            <Button size="xs" onClick={() => setEditing(true)}>
              Accept…
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="To-do title"
            className="flex-1 px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            aria-label="Assignee"
            className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="">Assign to…</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <Button
            size="xs"
            disabled={!title.trim() || !assigneeId}
            loading={decide.isPending}
            onClick={() =>
              decide.mutate(
                {
                  recordingId,
                  itemId: item.id,
                  decision: "accept",
                  title: title.trim(),
                  assigneeId,
                  dueDate,
                },
                { onSuccess: () => setEditing(false) },
              )
            }
          >
            Create to-do
          </Button>
        </div>
      )}
    </div>
  );
}

function MissedItemRow({
  meetingId,
  recordingId,
  item,
  canManage,
}: {
  meetingId: string;
  recordingId: string;
  item: MeetingAiMissedItem;
  canManage: boolean;
}) {
  const decide = useMissedItemDecision(meetingId);

  if (item.status !== "proposed") {
    return (
      <div className="px-3 py-2 rounded-lg bg-surface/50 text-sm text-muted line-clamp-1">
        {item.status === "actioned" ? "✓ Issue raised — " : ""}
        <span className={item.status === "dismissed" ? "line-through" : ""}>
          {item.text}
        </span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-2xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
          {MISSED_KIND_LABEL[item.kind]}
        </p>
        <p className="text-sm text-foreground/90 mt-0.5">{item.text}</p>
        {item.quote && (
          <p className="text-xs text-muted italic mt-0.5">“{item.quote}”</p>
        )}
      </div>
      {canManage && (
        <div className="flex gap-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              decide.mutate({ recordingId, itemId: item.id, decision: "dismiss" })
            }
            disabled={decide.isPending}
          >
            Dismiss
          </Button>
          {item.kind === "uncaptured_issue" && (
            <Button
              size="xs"
              loading={decide.isPending}
              onClick={() =>
                decide.mutate({ recordingId, itemId: item.id, decision: "action" })
              }
            >
              Raise as Issue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
