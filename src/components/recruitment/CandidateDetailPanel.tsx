"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import {
  useUpdateCandidate,
  useAiScreenCandidate,
  type Candidate,
  type Vacancy,
} from "@/hooks/useRecruitment";
import { fetchApi } from "@/lib/fetch-api";
import { AiScreenBadge } from "./AiScreenBadge";

interface Props {
  candidateId: string | null;
  vacancyId: string;
  onClose: () => void;
}

const STAGES = [
  "applied",
  "screened",
  "interviewed",
  "offered",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export function CandidateDetailPanel({ candidateId, vacancyId, onClose }: Props) {
  // Subscribe to the same vacancy cache key used by VacancyDetailPanel so that
  // optimistic updates from `useUpdateCandidate` trigger a re-render here.
  const { data: vacancy } = useQuery<
    (Vacancy & { candidates?: Candidate[] }) | undefined
  >({
    queryKey: ["vacancy", vacancyId],
    queryFn: () =>
      fetchApi<Vacancy & { candidates: Candidate[] }>(
        `/api/recruitment/${vacancyId}`,
      ),
    enabled: !!vacancyId,
    retry: 2,
    staleTime: 30_000,
  });
  const candidate = vacancy?.candidates?.find((c) => c.id === candidateId);

  const updateMutation = useUpdateCandidate();
  const aiScreenMutation = useAiScreenCandidate();

  // Optimistic stage — while a stage-update mutation is in flight, show the
  // user-selected "pending" stage; once the mutation settles we fall back
  // to the authoritative cached candidate.stage. On error, the underlying
  // hook reverts the cache and clears pendingStage so the select reverts.
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  useEffect(() => {
    if (updateMutation.status === "success" || updateMutation.status === "error") {
      setPendingStage(null);
    }
  }, [updateMutation.status, updateMutation.submittedAt]);
  const displayStage = pendingStage ?? candidate?.stage ?? "applied";

  // Debounced auto-save for notes
  const [notesDraft, setNotesDraft] = useState(candidate?.notes ?? "");
  useEffect(() => {
    setNotesDraft(candidate?.notes ?? "");
    // Only reset when switching candidates — not on every notes change from cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  useEffect(() => {
    if (!candidateId || !candidate) return;
    if (notesDraft === (candidate.notes ?? "")) return;
    const timer = setTimeout(() => {
      updateMutation.mutate({ id: candidateId, notes: notesDraft });
    }, 2000);
    return () => clearTimeout(timer);
    // updateMutation is stable across renders; intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft, candidateId, candidate?.notes]);

  if (!candidateId || !candidate) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-card border-l border-border shadow-xl overflow-y-auto z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">{candidate.name}</h3>
          <p className="text-xs text-muted truncate">
            {candidate.email ?? "(no email)"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Stage */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            htmlFor={`stage-${candidate.id}`}
          >
            Stage
          </label>
          <select
            id={`stage-${candidate.id}`}
            value={displayStage}
            onChange={(e) => {
              const next = e.target.value;
              setPendingStage(next);
              updateMutation.mutate({ id: candidate.id, stage: next });
            }}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* AI Screen */}
        <div className="border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">AI Screening</span>
            <button
              type="button"
              onClick={() => aiScreenMutation.mutate(candidate.id)}
              disabled={aiScreenMutation.isPending || !candidate.resumeText}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !candidate.resumeText
                  ? "Resume text required to screen"
                  : undefined
              }
            >
              <Sparkles className="w-3 h-3" />
              {candidate.aiScreenScore != null ? "Re-screen" : "AI Screen"}
            </button>
          </div>
          {candidate.aiScreenScore != null && (
            <AiScreenBadge
              score={candidate.aiScreenScore}
              summary={candidate.aiScreenSummary}
            />
          )}
          {candidate.aiScreenScore == null && (
            <p className="text-xs text-muted">No screening yet.</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            htmlFor={`notes-${candidate.id}`}
          >
            Notes
          </label>
          <textarea
            id={`notes-${candidate.id}`}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={5}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
            placeholder="Add notes…"
          />
          <p className="text-xs text-muted mt-1">
            Auto-saves 2s after last edit.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              updateMutation.mutate({ id: candidate.id, stage: "offered" })
            }
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-brand text-white hover:bg-brand/90"
          >
            Make Offer
          </button>
          <button
            type="button"
            onClick={() =>
              updateMutation.mutate({ id: candidate.id, stage: "rejected" })
            }
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
