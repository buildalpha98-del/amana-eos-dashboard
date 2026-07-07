"use client";

/**
 * QipSuggestionsPanel — review surface for AI-proposed SAT/QIP updates.
 *
 * Slide-over grouped by quality area → week. Each suggestion shows current
 * vs proposed text, the AI's rationale, and the evidence excerpts behind it.
 * Nothing touches the document until the director accepts (or edits) it —
 * the suggestion row itself becomes the permanent audit trail.
 */

import { useState } from "react";
import { X, Check, Pencil, Ban, Loader2, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useQipSuggestions,
  useReviewQipSuggestion,
  type QipSuggestionItem,
} from "@/hooks/useQipSuggestions";

const FIELD_LABELS: Record<QipSuggestionItem["field"], string> = {
  strengths: "Strengths",
  areasForImprovement: "Areas for improvement",
  progressNotes: "Progress notes",
  evidenceCollected: "Evidence collected",
};

const QA_NAMES: Record<number, string> = {
  1: "Educational Program and Practice",
  2: "Children's Health and Safety",
  3: "Physical Environment",
  4: "Staffing Arrangements",
  5: "Relationships with Children",
  6: "Collaborative Partnerships",
  7: "Governance and Leadership",
};

function SuggestionCard({
  suggestion,
  qipId,
  serviceId,
}: {
  suggestion: QipSuggestionItem;
  qipId: string;
  serviceId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(suggestion.proposedText);
  const [showEvidence, setShowEvidence] = useState(false);
  const review = useReviewQipSuggestion(qipId, serviceId);

  const busy = review.isPending;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[color:var(--color-primary,#004E64)] bg-[color:var(--color-primary,#004E64)]/10 px-2 py-0.5 rounded">
          {FIELD_LABELS[suggestion.field]}
        </span>
        <span className="text-[11px] text-gray-400">
          week of {new Date(suggestion.weekOf).toLocaleDateString("en-AU")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
            Current
          </p>
          <p className="text-sm text-gray-500 whitespace-pre-wrap bg-gray-50 rounded p-2 min-h-[3rem]">
            {suggestion.currentText || <em>Empty</em>}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide mb-1">
            Proposed
          </p>
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={5}
              className="w-full text-sm border border-emerald-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-emerald-50 rounded p-2 min-h-[3rem]">
              {suggestion.proposedText}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 italic">Why: {suggestion.rationale}</p>

      <div>
        <button
          type="button"
          onClick={() => setShowEvidence((s) => !s)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <Eye className="w-3.5 h-3.5" />
          {showEvidence ? "Hide" : "Show"} evidence ({suggestion.evidenceRefs.length})
        </button>
        {showEvidence && (
          <ul className="mt-2 space-y-1.5">
            {suggestion.evidenceRefs.map((ref, i) => (
              <li
                key={`${ref.id}-${i}`}
                className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2"
              >
                <span className="font-medium capitalize">{ref.type}:</span> {ref.excerpt}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            review.mutate({ suggestionId: suggestion.id, action: "reject" })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Ban className="w-3.5 h-3.5" /> Reject
        </button>
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !editText.trim()}
              onClick={() =>
                review.mutate(
                  { suggestionId: suggestion.id, action: "edit", text: editText.trim() },
                  { onSuccess: () => setEditing(false) },
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save & accept
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit & accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                review.mutate({ suggestionId: suggestion.id, action: "accept" })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Accept
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function QipSuggestionsPanel({
  qipId,
  serviceId,
  documentLabel,
  open,
  onClose,
}: {
  qipId: string;
  serviceId: string;
  documentLabel: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQipSuggestions(open ? qipId : undefined);
  const suggestions = data?.suggestions ?? [];

  const byQa = new Map<number, QipSuggestionItem[]>();
  for (const s of suggestions) {
    if (!byQa.has(s.qualityArea)) byQa.set(s.qualityArea, []);
    byQa.get(s.qualityArea)!.push(s);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close review panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative w-full sm:max-w-xl bg-gray-50 h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[color:var(--color-primary,#004E64)]" />
            <h2 className="text-sm font-semibold text-gray-800">
              Pending {documentLabel} updates
            </h2>
            <span className="text-xs text-gray-400">({suggestions.length})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading suggestions…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing pending — the document reflects all reviewed evidence.
            </p>
          ) : (
            [...byQa.entries()]
              .sort(([a], [b]) => a - b)
              .map(([qa, items]) => (
                <section key={qa} className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    QA{qa} · {QA_NAMES[qa]}
                  </h3>
                  {items.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      qipId={qipId}
                      serviceId={serviceId}
                    />
                  ))}
                </section>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
