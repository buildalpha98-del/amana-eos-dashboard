"use client";

import type { ActivationRow } from "@/hooks/useActivations";
import { Sparkles, Calendar, Clock } from "lucide-react";

const STAGE_BADGE: Record<ActivationRow["lifecycleStage"], string> = {
  concept: "bg-surface text-muted border-border",
  approved: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  logistics: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  final_push: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  delivered: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  recap_published: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  cancelled: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const STAGE_LABEL: Record<ActivationRow["lifecycleStage"], string> = {
  concept: "Concept",
  approved: "Approved",
  logistics: "Logistics",
  final_push: "Final push",
  delivered: "Delivered",
  recap_published: "Recap published",
  cancelled: "Cancelled",
};

const RECAP_LABEL: Record<ActivationRow["recapStatus"], { text: string; className: string }> = {
  published: { text: "✓ Published", className: "text-green-700" },
  overdue: { text: "⚠ Overdue", className: "text-red-700 font-semibold" },
  due_soon: { text: "🕐 Due", className: "text-amber-700" },
  not_due: { text: "—", className: "text-muted" },
};

function fmtScheduled(row: ActivationRow): string {
  if (!row.scheduledFor) return "—";
  const dateStr = new Date(row.scheduledFor).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
  if (row.daysUntilScheduled === null) return dateStr;
  if (row.daysUntilScheduled === 0) return `${dateStr} · today`;
  if (row.daysUntilScheduled > 0) return `${dateStr} · in ${row.daysUntilScheduled}d`;
  return `${dateStr} · ${-row.daysUntilScheduled}d ago`;
}

interface ActivationsListTableProps {
  activations: ActivationRow[];
  onSelect: (a: ActivationRow) => void;
}

export function ActivationsListTable({ activations, onSelect }: ActivationsListTableProps) {
  if (activations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
        No activations match this view.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="text-left p-3 font-medium">Activation</th>
            <th className="text-left p-3 font-medium">Centre</th>
            <th className="text-left p-3 font-medium">Scheduled</th>
            <th className="text-left p-3 font-medium">Stage</th>
            <th className="text-left p-3 font-medium">Recap</th>
            <th className="text-left p-3 font-medium">Coordinator</th>
          </tr>
        </thead>
        <tbody>
          {activations.map((a) => (
            <tr
              key={a.id}
              className="border-t border-border hover:bg-surface/50 cursor-pointer"
              onClick={() => onSelect(a)}
            >
              <td className="p-3">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-muted" aria-hidden />
                  {a.title}
                </div>
                <div className="text-xs text-muted capitalize">
                  {a.activationType?.replace(/_/g, " ") ?? "Type not set"}
                </div>
              </td>
              <td className="p-3 text-foreground">{a.service.name}</td>
              <td className="p-3 text-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted" aria-hidden />
                  {fmtScheduled(a)}
                </span>
              </td>
              <td className="p-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STAGE_BADGE[a.lifecycleStage]}`}>
                  {STAGE_LABEL[a.lifecycleStage]}
                </span>
              </td>
              <td className={`p-3 text-xs ${RECAP_LABEL[a.recapStatus].className}`}>
                {RECAP_LABEL[a.recapStatus].text}
                {a.daysSinceDelivered !== null && (
                  <div className="text-2xs text-muted flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" aria-hidden />
                    {a.daysSinceDelivered}d ago
                  </div>
                )}
              </td>
              <td className="p-3 text-muted text-xs">{a.coordinator?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
