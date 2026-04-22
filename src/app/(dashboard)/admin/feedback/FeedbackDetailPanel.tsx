"use client";

import { useState, useEffect, useRef } from "react";
import { X, User, Calendar, Link as LinkIcon, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { Skeleton } from "@/components/ui/Skeleton";
import { useFeedback, useUpdateFeedback } from "@/hooks/useInternalFeedback";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

function formatFull(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FeedbackDetailPanel({ feedbackId, onClose }: { feedbackId: string; onClose: () => void }) {
  const { data, isLoading } = useFeedback(feedbackId);
  const feedback = data?.feedback;

  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dirty ref prevents a mid-type server response from clobbering the user's text.
  // Flips true on keystroke, back to false only after the successful save round-trip.
  const notesDirtyRef = useRef(false);

  const qc = useQueryClient();
  const update = useUpdateFeedback();

  // Only sync server → local when NOT dirty (user isn't mid-type).
  // Dependency on id covers switching between feedback items.
  useEffect(() => {
    if (!notesDirtyRef.current) {
      setNotes(feedback?.adminNotes ?? "");
    }
  }, [feedback?.id, feedback?.adminNotes]);

  // Esc-to-close handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleStatusChange = (newStatus: string) => {
    if (!feedback) return;
    const prev = feedback.status;
    // Key must match useFeedback() in src/hooks/useInternalFeedback.ts
    const detailKey = ["internal-feedback", "detail", feedback.id];
    qc.setQueryData<{ feedback: typeof feedback } | undefined>(
      detailKey,
      (old) => (old ? { feedback: { ...old.feedback, status: newStatus as typeof feedback.status } } : old),
    );
    update.mutate(
      { id: feedback.id, status: newStatus },
      {
        onError: (err: Error) => {
          qc.setQueryData<{ feedback: typeof feedback } | undefined>(
            detailKey,
            (old) => (old ? { feedback: { ...old.feedback, status: prev } } : old),
          );
          toast({ variant: "destructive", description: err.message || "Failed to update status" });
        },
      },
    );
  };

  const handleNotesChange = (v: string) => {
    notesDirtyRef.current = true;
    setNotes(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!feedback) return;
      setNotesSaving(true);
      update.mutate(
        { id: feedback.id, adminNotes: v },
        {
          onSuccess: () => {
            setNotesSaving(false);
            setNotesSavedAt(Date.now());
            notesDirtyRef.current = false;
          },
          onError: (err: Error) => {
            setNotesSaving(false);
            toast({ variant: "destructive", description: err.message || "Failed to save notes" });
          },
        },
      );
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="w-full max-w-xl bg-card border-l border-border shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-detail-title"
        aria-label="Feedback detail"
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="feedback-detail-title" className="text-lg font-semibold">Feedback detail</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        {isLoading && (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {feedback && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted" />
              <span className="font-medium">{feedback.author.name ?? feedback.author.email}</span>
              <span className="text-muted">· {feedback.author.role}</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted">
              <Calendar className="h-4 w-4" />
              <span>{formatFull(feedback.createdAt)}</span>
            </div>

            {feedback.page && (
              <div className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4 text-muted" />
                <a href={feedback.page} className="text-brand hover:underline font-mono text-xs" target="_blank" rel="noopener noreferrer">
                  {feedback.page}
                </a>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted mb-1">Category</p>
              <p className="text-sm capitalize">{feedback.category.replace("_", " ")}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted mb-1">Message</p>
              <div className="rounded-lg border border-border bg-surface/30 p-4 text-sm whitespace-pre-wrap">
                {feedback.message}
              </div>
            </div>

            {feedback.screenshotUrl && (
              <div>
                <p className="text-xs font-medium text-muted mb-1">Screenshot</p>
                <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={feedback.screenshotUrl}
                    alt="Feedback screenshot"
                    className="rounded-lg border border-border max-h-80 object-contain"
                  />
                </a>
              </div>
            )}

            <div>
              <label htmlFor="fb-status" className="block text-xs font-medium text-muted mb-1">Status</label>
              <select
                id="fb-status"
                value={feedback.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="fb-notes" className="flex items-center justify-between text-xs font-medium text-muted mb-1">
                <span>Admin notes</span>
                <span className="flex items-center gap-1 text-[11px]">
                  {notesSaving && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
                  {!notesSaving && notesSavedAt && <span className="text-emerald-600">Saved</span>}
                </span>
              </label>
              <textarea
                id="fb-notes"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Add investigation notes, fix details, or context…"
                className="w-full resize-none rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1 text-[11px] text-muted">{notes.length} / 5000</p>
            </div>

            {feedback.resolvedAt && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">
                Resolved at {formatFull(feedback.resolvedAt)}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
