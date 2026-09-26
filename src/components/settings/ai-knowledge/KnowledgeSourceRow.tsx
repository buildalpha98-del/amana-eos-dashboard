"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, RefreshCw, Trash2, EyeOff, Eye } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { isManual, KIND_LABEL, type KnowledgeEntrySummary, type Tier } from "./types";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const tierClass = (t: Tier) =>
  t === "safety_critical"
    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
    : "bg-surface text-muted";

interface Props {
  entry: KnowledgeEntrySummary;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * One KnowledgeSource in the console. Tier override, exclude/restore and
 * re-index apply to every kind; edit/delete only to `manual` rows (adapter-
 * owned sources change at their origin).
 */
export function KnowledgeSourceRow({ entry: e, onEdit, onDelete }: Props) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
  const onError = (err: Error) =>
    toast({ variant: "destructive", description: err.message || "Something went wrong" });

  const patch = useMutation({
    mutationFn: (body: { tierOverride?: Tier | null; status?: "active" | "excluded" }) =>
      mutateApi(`/api/settings/ai-knowledge/${e.id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
    onError,
  });
  const reindex = useMutation({
    mutationFn: () =>
      mutateApi<{ ok: boolean; chunks?: number; error?: string }>(
        `/api/settings/ai-knowledge/${e.id}/reindex`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      invalidate();
      toast({
        description: r.ok ? `Re-indexed (${r.chunks ?? 0} chunks)` : `Re-index failed: ${r.error ?? "unknown"}`,
        ...(r.ok ? {} : { variant: "destructive" as const }),
      });
    },
    onError,
  });

  const effectiveTier = e.tierOverride ?? e.tier;
  const dim = e.status !== "active" ? "opacity-60" : "";
  const editable = isManual(e);

  return (
    <li
      className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border last:border-b-0 ${dim} ${editable ? "cursor-pointer hover:bg-surface" : ""}`}
      onClick={editable ? () => onEdit(e.id) : undefined}
    >
      <div className="flex-1 min-w-[16rem]">
        <div className="flex flex-wrap items-center gap-2">
          {e.externalUrl ? (
            <a
              href={e.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
              onClick={(ev) => ev.stopPropagation()}
            >
              {e.title} <ExternalLink className="inline h-3 w-3 text-muted" />
            </a>
          ) : (
            <span className="font-medium text-foreground">{e.title}</span>
          )}
          <span className="text-2xs px-1.5 py-0.5 rounded bg-surface text-muted">{KIND_LABEL[e.sourceKind]}</span>
          <span className="text-2xs text-muted">{e.category}</span>
          {!!e.qualityArea && <span className="text-2xs text-muted">QA{e.qualityArea}</span>}
          {!!e.version && <span className="text-2xs text-muted">V{e.version}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted mt-0.5">
          <span>{e.serviceName ?? "Org-wide"}</span>
          <span>·</span>
          <span>{e.state ?? "All states"}</span>
          <span>·</span>
          <span>{e.chunkCount} chunks</span>
          <span>·</span>
          <span>Indexed {formatDate(e.indexedAt)}</span>
          {e.indexError && <span className="text-danger">{e.indexError}</span>}
        </div>
      </div>
      <span className={`text-2xs px-1.5 py-0.5 rounded ${tierClass(effectiveTier)}`}>
        {effectiveTier === "safety_critical" ? "Safety-critical" : "General"}
        {e.tierOverride ? " (override)" : ""}
      </span>
      {e.status !== "active" && (
        <span className="text-2xs px-1.5 py-0.5 rounded bg-surface text-muted">
          {e.status === "superseded"
            ? "Superseded"
            : e.excludedBy === "admin"
              ? "Excluded (admin)"
              : "Excluded (origin unpublished)"}
        </span>
      )}
      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
        <select
          aria-label="Tier override"
          className="text-2xs rounded border border-border bg-card px-1 py-0.5"
          value={e.tierOverride ?? "auto"}
          onChange={(ev) =>
            // The <select> only offers "auto" plus the two Tier values, so the
            // cast narrows a string we control — not user-typed input.
            patch.mutate({ tierOverride: ev.target.value === "auto" ? null : (ev.target.value as Tier) })
          }
          disabled={patch.isPending}
        >
          <option value="auto">Auto ({e.tier === "safety_critical" ? "safety" : "general"})</option>
          <option value="safety_critical">Safety-critical</option>
          <option value="general">General</option>
        </select>
        {e.status !== "superseded" && (
          <button
            type="button"
            aria-label={e.status === "excluded" ? "Restore" : "Exclude"}
            title={e.status === "excluded" ? "Restore to search" : "Exclude from search"}
            className="p-1 rounded hover:bg-surface text-muted"
            onClick={() => patch.mutate({ status: e.status === "excluded" ? "active" : "excluded" })}
            disabled={patch.isPending}
          >
            {e.status === "excluded" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          aria-label="Re-index"
          title="Re-chunk and re-embed"
          className="p-1 rounded hover:bg-surface text-muted"
          onClick={() => reindex.mutate()}
          disabled={reindex.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`} />
        </button>
        {editable && (
          <>
            <button
              type="button"
              aria-label="Edit"
              className="p-1 rounded hover:bg-surface text-muted"
              onClick={() => onEdit(e.id)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              className="p-1 rounded hover:bg-surface text-danger"
              onClick={() => onDelete(e.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
