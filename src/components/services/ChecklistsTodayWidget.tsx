"use client";

/**
 * "Checklists today" — each section's ticks, its due time and whether
 * it's overdue (2026-10-08, after OWNA's daily "2 of 8 signed off").
 * Renders nothing on a day with no checklist and no due times, so a centre
 * that doesn't use checklists here never sees an empty box.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import { SESSION_LABELS, sectionLabel, type SectionStatus } from "@/lib/checklist-due";

export function ChecklistsTodayWidget({ serviceId }: { serviceId: string }) {
  const { data } = useQuery<{ sections: SectionStatus[] }>({
    queryKey: ["service", serviceId, "checklists-today"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/checklists/today`),
    refetchInterval: 120_000,
    retry: 1,
    meta: { suppressGlobalErrorToast: true },
  });
  const sections = data?.sections ?? [];
  if (sections.length === 0) return null;

  const complete = sections.filter((s) => !s.missing && s.done === s.total).length;
  const href = `/services/${serviceId}?tab=daily&sub=checklists`;

  return (
    <div>
      <h3 className="text-2xs font-heading font-semibold text-muted uppercase tracking-[0.08em] mb-2">
        Checklists today · {complete} of {sections.length} sections done
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sections.map((s) => {
          const done = !s.missing && s.done === s.total;
          return (
            <li key={`${s.sessionType}:${s.category}`}>
              <Link
                href={href}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  s.overdue
                    ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40"
                    : "border-border bg-card hover:bg-surface",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                ) : s.overdue ? (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                ) : (
                  <ClipboardCheck className="h-5 w-5 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">
                    {sectionLabel(s.category)}
                    <span className="font-normal text-muted"> · {SESSION_LABELS[s.sessionType] ?? s.sessionType}</span>
                  </span>
                  <span className="block text-xs text-muted">
                    {s.missing ? "Not started" : `${s.done} of ${s.total} ticked`}
                  </span>
                </span>
                {s.due && (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs whitespace-nowrap",
                      s.overdue ? "font-semibold text-red-700 dark:text-red-300" : "text-muted",
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {s.overdue ? "Overdue" : "Due"} {s.due}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
