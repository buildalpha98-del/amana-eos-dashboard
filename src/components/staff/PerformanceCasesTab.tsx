"use client";

/**
 * PerformanceCasesTab — the "Cases" sub-tab inside the Performance
 * section on a staff profile. Lists existing warnings/PIPs/grievances/
 * commendations + lets an admin add new ones.
 *
 * Admin-only. The Performance section parent already gates rendering;
 * if a non-admin somehow lands here, the API would refuse anyway.
 *
 * Detail view + edit happen in an inline modal — same pattern as the
 * other staff-profile modals. No separate page, no router push.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  AlertTriangle,
  AlertOctagon,
  ClipboardList,
  MessageSquare,
  Shield,
  Trophy,
  CheckCircle2,
  Loader2,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";

// ─── Types (mirror the API shapes) ────────────────────────────────────

type CaseType =
  | "verbal_warning"
  | "written_warning"
  | "final_warning"
  | "pip"
  | "grievance"
  | "allegation"
  | "commendation"
  | "conversation";

type CaseStatus = "open" | "in_progress" | "resolved" | "escalated" | "closed";

interface PerformanceCase {
  id: string;
  userId: string;
  raisedById: string;
  raisedBy: { id: string; name: string };
  closedBy: { id: string; name: string } | null;
  type: CaseType;
  status: CaseStatus;
  title: string;
  summary: string;
  occurredAt: string; // ISO
  followUpAt: string | null;
  outcome: string | null;
  closedAt: string | null;
  fileUrl: string | null;
  fileName: string | null;
  confidential: boolean;
  createdAt: string;
}

// ─── Visual config ────────────────────────────────────────────────────

const TYPE_META: Record<
  CaseType,
  { label: string; icon: React.ComponentType<{ className?: string }>; pill: string }
> = {
  verbal_warning: {
    label: "Verbal warning",
    icon: MessageSquare,
    pill: "bg-amber-50 text-amber-800 border-amber-200",
  },
  written_warning: {
    label: "Written warning",
    icon: AlertTriangle,
    pill: "bg-orange-50 text-orange-800 border-orange-200",
  },
  final_warning: {
    label: "Final warning",
    icon: AlertOctagon,
    pill: "bg-red-50 text-red-800 border-red-200",
  },
  pip: {
    label: "Performance improvement plan",
    icon: ClipboardList,
    pill: "bg-purple-50 text-purple-800 border-purple-200",
  },
  grievance: {
    label: "Grievance (raised by)",
    icon: Shield,
    pill: "bg-blue-50 text-blue-800 border-blue-200",
  },
  allegation: {
    label: "Allegation (against)",
    icon: Shield,
    pill: "bg-red-50 text-red-800 border-red-200",
  },
  commendation: {
    label: "Commendation",
    icon: Trophy,
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  conversation: {
    label: "Informal conversation",
    icon: MessageSquare,
    pill: "bg-gray-50 text-gray-800 border-gray-200",
  },
};

function statusPill(status: CaseStatus): string {
  switch (status) {
    case "resolved":
    case "closed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "escalated":
      return "bg-red-50 text-red-700 border-red-200";
    case "in_progress":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────

export interface PerformanceCasesTabProps {
  targetUserId: string;
  targetUserName: string;
  viewerRole: string;
}

export function PerformanceCasesTab({
  targetUserId,
  targetUserName,
  viewerRole,
}: PerformanceCasesTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<PerformanceCase | null>(null);

  const isOwner = viewerRole === "owner";

  const { data, isLoading, error } = useQuery<
    { cases: PerformanceCase[] },
    ApiResponseError
  >({
    queryKey: ["performance-cases", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/performance-cases?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
  });

  const cases = data?.cases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Records of warnings, PIPs, grievances, commendations, and informal
          conversations. Retained for the Fair Work record-keeping window
          (7 years). Confidential cases are visible to the owner role only.
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors shrink-0"
          data-testid="performance-case-add"
        >
          <Plus className="w-4 h-4" />
          Add case
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading cases…</p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load cases. Please refresh.
        </p>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted">
            No cases on file for {targetUserName}.
          </p>
          <p className="text-xs text-muted mt-1">
            Log warnings, PIPs, grievances or commendations here. They surface
            on the Performance section only — staff don&apos;t see them.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {cases.map((c) => {
            const meta = TYPE_META[c.type];
            const Icon = meta.icon;
            return (
              <li
                key={c.id}
                className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface/50 cursor-pointer"
                onClick={() => setDetailFor(c)}
                data-testid={`performance-case-${c.id}`}
              >
                <div
                  className={cn(
                    "shrink-0 p-1.5 rounded-md border",
                    meta.pill.replace("text-", "").replace(/bg-(\w+)-50/, "bg-$1-100"),
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {c.title}
                    </span>
                    {c.confidential && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                        Confidential
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{meta.label}</span>
                    <span>·</span>
                    <span>Occurred {formatDate(c.occurredAt)}</span>
                    <span>·</span>
                    <span>Raised by {c.raisedBy.name}</span>
                    {c.followUpAt && (
                      <>
                        <span>·</span>
                        <span className="text-amber-700">
                          Follow-up {formatDate(c.followUpAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                    statusPill(c.status),
                  )}
                >
                  {c.status.replace("_", " ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && (
        <CaseModal
          mode="create"
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          isOwner={isOwner}
          onClose={() => setAddOpen(false)}
        />
      )}
      {detailFor && (
        <CaseModal
          mode="edit"
          existing={detailFor}
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          isOwner={isOwner}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}

// ─── Add / edit modal ─────────────────────────────────────────────────

interface CaseModalProps {
  mode: "create" | "edit";
  existing?: PerformanceCase;
  targetUserId: string;
  targetUserName: string;
  isOwner: boolean;
  onClose: () => void;
}

function CaseModal({
  mode,
  existing,
  targetUserId,
  targetUserName,
  isOwner,
  onClose,
}: CaseModalProps) {
  useEscapeClose(onClose);
  const qc = useQueryClient();
  const [type, setType] = useState<CaseType>(existing?.type ?? "conversation");
  const [status, setStatus] = useState<CaseStatus>(existing?.status ?? "open");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [occurredAt, setOccurredAt] = useState(
    existing?.occurredAt?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  );
  const [followUpAt, setFollowUpAt] = useState(
    existing?.followUpAt?.slice(0, 10) ?? "",
  );
  const [outcome, setOutcome] = useState(existing?.outcome ?? "");
  const [confidential, setConfidential] = useState(
    existing?.confidential ?? false,
  );

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        userId: targetUserId,
        type,
        status,
        title: title.trim(),
        summary: summary.trim(),
        occurredAt,
        followUpAt: followUpAt || null,
        outcome: outcome.trim() || null,
        confidential,
      };
      if (mode === "create") {
        return mutateApi("/api/performance-cases", {
          method: "POST",
          body,
        });
      }
      return mutateApi(`/api/performance-cases/${existing!.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance-cases", targetUserId] });
      toast({
        description:
          mode === "create" ? "Case created." : "Case updated.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      mutateApi(`/api/performance-cases/${existing!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance-cases", targetUserId] });
      toast({ description: "Case removed (soft-deleted, retained 7 years)." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleDelete = () => {
    if (
      !window.confirm(
        `Soft-delete this case? It's hidden from the UI but retained for 7 years per Fair Work record-keeping. Only the owner role can do this.`,
      )
    )
      return;
    deleteMutation.mutate();
  };

  const canSubmit =
    !!title.trim() && !!summary.trim() && !!occurredAt && !submit.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submit.isPending) onClose();
      }}
    >
      <div
        className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {mode === "create" ? "New case" : "Edit case"} · {targetUserName}
            </h2>
            {mode === "edit" && existing && (
              <p className="text-xs text-muted mt-0.5">
                Created {formatDate(existing.createdAt)} by{" "}
                {existing.raisedBy.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submit.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-type"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Type
              </label>
              <select
                id="case-type"
                value={type}
                onChange={(e) => setType(e.target.value as CaseType)}
                disabled={submit.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {Object.entries(TYPE_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="case-status"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Status
              </label>
              <select
                id="case-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus)}
                disabled={submit.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="case-title"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Title
            </label>
            <input
              id="case-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={submit.isPending}
              placeholder="Brief headline, e.g. 'Late arrival pattern Mar-Apr'"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="case-summary"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Summary
            </label>
            <textarea
              id="case-summary"
              rows={6}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={submit.isPending}
              placeholder="Facts only. What happened, when, who was present, what was discussed. Avoid speculation."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-muted mt-1">
              Tip: write as if Fair Work might read it. Specific dates,
              specific behaviour, what was said by whom.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-occurred"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Date occurred
              </label>
              <input
                id="case-occurred"
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                disabled={submit.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="case-followup"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Follow-up date{" "}
                <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                id="case-followup"
                type="date"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                disabled={submit.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="case-outcome"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Outcome{" "}
              <span className="text-muted font-normal">
                (fill in when resolved)
              </span>
            </label>
            <textarea
              id="case-outcome"
              rows={3}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              disabled={submit.isPending}
              placeholder="What was the resolution? Agreed actions, consequences, follow-up commitments."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>

          {isOwner && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
                disabled={submit.isPending}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium">Confidential</span>
                <span className="block text-xs text-muted">
                  Only the owner role will be able to see this case. Use for
                  sensitive allegations where even other admins shouldn&apos;t
                  see the detail.
                </span>
              </span>
            </label>
          )}
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {mode === "edit" && isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submit.isPending || deleteMutation.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Soft-delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submit.isPending}
              className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
            >
              {submit.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "create" ? (
                <Plus className="w-4 h-4" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
              {mode === "create" ? "Create case" : "Save changes"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
