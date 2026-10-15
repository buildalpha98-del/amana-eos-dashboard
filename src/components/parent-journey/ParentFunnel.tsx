"use client";

/**
 * "Where families are now" — the parent funnel at the top of the Parent
 * Journey page (src/lib/parent-funnel.ts). Totals across the organisation,
 * then one row per centre, so a centre leaving families waiting stands out.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FunnelRow } from "@/lib/parent-funnel";

const STAGES: { key: keyof FunnelRow; label: string; hint: string }[] = [
  { key: "enquired", label: "Enquired", hint: "Hasn't started the form" },
  { key: "formStarted", label: "Filling in the form", hint: "Started, not submitted" },
  { key: "waiting", label: "Waiting on us", hint: "Submitted, not yet approved" },
  { key: "ownaSetup", label: "Setting up OWNA", hint: "Approved, OWNA checklist not finished" },
  { key: "ready", label: "Ready to start", hint: "OWNA done, no sessions attended yet" },
  { key: "attending", label: "Attending", hint: "A child has been signed in" },
];

const num = (r: FunnelRow, k: keyof FunnelRow) => (typeof r[k] === "number" ? (r[k] as number) : 0);

export function ParentFunnel() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery<{ days: number; rows: FunnelRow[] }>({
    queryKey: ["parent-funnel", days],
    queryFn: () => fetchApi(`/api/parent-journey/funnel?days=${days}`),
    retry: 2,
  });
  const rows = data?.rows ?? [];
  const total = (k: keyof FunnelRow) => rows.reduce((n, r) => n + num(r, k), 0);
  const overdue = total("overdue");
  const lost = total("lost");
  const noLive = rows.filter((r) => !r.attendanceLive).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Where families are now">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-base font-semibold text-foreground">Where families are now</h2>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          Families from the last
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          >
            {[30, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="mt-3 h-40 w-full rounded-lg" />
      ) : (
        <>
          {/* Totals — the funnel at a glance */}
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((s, i) => (
              <li key={s.key} className="rounded-lg bg-surface p-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  {i + 1}. {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{total(s.key)}</p>
                <p className="text-2xs text-muted">{s.hint}</p>
                {s.key === "waiting" && overdue > 0 && (
                  <p className="mt-1 text-2xs font-semibold text-red-700 dark:text-red-300">{overdue} past 24 hours</p>
                )}
              </li>
            ))}
          </ol>
          {lost > 0 && <p className="mt-2 text-xs text-muted">{lost} enquir{lost === 1 ? "y" : "ies"} went cold or withdrew in this period.</p>}

          {/* Per centre */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Centre</th>
                  {STAGES.map((s) => (
                    <th key={s.key} className="px-2 py-2 text-right font-semibold">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.serviceId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.serviceName}</td>
                    {STAGES.map((s) => {
                      const n = num(r, s.key);
                      const unknown = !r.attendanceLive && s.key === "attending";
                      return (
                        <td
                          key={s.key}
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            n === 0 ? "text-muted" : "text-foreground",
                            s.key === "waiting" && r.overdue > 0 && "font-semibold text-red-700 dark:text-red-300",
                          )}
                          title={unknown ? "OWNA sign-ins aren't syncing for this centre" : undefined}
                        >
                          {unknown ? "—" : n}
                          {s.key === "waiting" && r.overdue > 0 ? ` (${r.overdue} late)` : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {noLive > 0 && (
            <p className="mt-2 text-xs text-muted">
              &ldquo;—&rdquo; = OWNA sign-ins aren&apos;t syncing for that centre yet, so we can&apos;t tell who has started;
              those families show under &ldquo;Ready to start&rdquo;.
            </p>
          )}
        </>
      )}
    </section>
  );
}
