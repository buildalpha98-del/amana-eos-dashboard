"use client";

import { Plus } from "lucide-react";
import {
  useTermReadiness,
  type VendorBriefListItem,
} from "@/hooks/useVendorBriefs";
import type { TermReadinessCategory } from "@prisma/client";
import { StatusPill } from "./status-pill";

const CATEGORY_LABELS: Record<TermReadinessCategory, string> = {
  flyers: "Flyers",
  banners: "Banners",
  signage: "Signage",
  holiday_programme_materials: "Holiday materials",
  enrolment_posters: "Enrolment posters",
  other_print: "Other print",
};

export function TermMatrix({
  termYear,
  termNumber,
  onOpenBrief,
  onEmptyCellClick,
}: {
  termYear: number;
  termNumber: number;
  onOpenBrief: (id: string) => void;
  onEmptyCellClick: (serviceId: string, category: TermReadinessCategory) => void;
}) {
  const { data, isLoading } = useTermReadiness(termYear, termNumber);

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/30 px-4 py-6 text-center text-sm text-muted">
        Loading term-readiness matrix…
      </div>
    );
  }

  // Build a (serviceId, category) → brief index for fast lookup.
  const byCell = new Map<string, VendorBriefListItem>();
  for (const m of data.matrix) {
    if (m.serviceId && m.category) {
      byCell.set(`${m.serviceId}:${m.category}`, m.brief);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="border-b border-border bg-surface/40 text-foreground/70">
          <tr>
            <th className="sticky left-0 z-10 bg-surface/40 px-3 py-2 text-left font-medium">
              Centre
            </th>
            {data.categories.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-medium">
                {CATEGORY_LABELS[c]}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {data.centres.map((centre) => {
            const rowBriefs = data.categories.map((c) =>
              byCell.get(`${centre.id}:${c}`) ?? null,
            );
            const filled = rowBriefs.filter(Boolean).length;
            return (
              <tr key={centre.id} className="border-b border-border/60">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground">
                  {centre.name}
                  {centre.state && (
                    <span className="ml-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted">
                      {centre.state}
                    </span>
                  )}
                </td>
                {data.categories.map((c, i) => {
                  const brief = rowBriefs[i];
                  if (!brief) {
                    return (
                      <td key={c} className="px-2 py-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => onEmptyCellClick(centre.id, c)}
                          aria-label={`Add ${CATEGORY_LABELS[c]} for ${centre.name}`}
                          className="flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border bg-surface/20 text-muted hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td key={c} className="px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => onOpenBrief(brief.id)}
                        className="flex h-12 w-full flex-col items-start justify-center rounded-md border border-border bg-card px-2 py-1 text-left transition-colors hover:border-brand/40 hover:bg-surface/40"
                      >
                        <span className="font-mono text-[10px] text-muted">
                          {brief.briefNumber}
                        </span>
                        <StatusPill status={brief.status} />
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono ${
                      filled === data.categories.length
                        ? "bg-emerald-50 text-emerald-700"
                        : filled === 0
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {filled}/{data.categories.length}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
