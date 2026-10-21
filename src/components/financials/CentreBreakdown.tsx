"use client";

/**
 * Financials → Centre breakdown (Daniel, 21 Oct 2026): every centre side by
 * side for a week or month — sessions, occupancy, revenue, staff, spend,
 * bank, and how fresh the attendance data is. Click a centre for detail.
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Database } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import type { BreakdownPeriod, CentreBreakdownRow } from "@/lib/centre-breakdown";

interface Resp {
  label: string;
  rows: CentreBreakdownRow[];
}
const PERIODS: [BreakdownPeriod, string][] = [
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
];
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
function ago(iso: string | null) {
  if (!iso) return "No attendance data yet";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

export function CentreBreakdown() {
  const [period, setPeriod] = useState<BreakdownPeriod>("this_month");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery<Resp>({
    queryKey: ["financials-centres", period],
    queryFn: () => fetchApi(`/api/financials/centres?period=${period}`),
    retry: 2,
  });
  const rows = q.data?.rows ?? [];
  const tot = rows.reduce(
    (t, r) => ({
      sessions: t.sessions + r.sessions.total,
      revenue: t.revenue + r.revenue,
      staff: t.staff + r.staffCost,
      spend: t.spend + r.purchases + r.groceries + r.materials,
      bank: t.bank + r.bank,
    }),
    { sessions: 0, revenue: 0, staff: 0, spend: 0, bank: 0 },
  );

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="centre-breakdown">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h2 id="centre-breakdown" className="font-heading text-base font-semibold text-foreground">
            Centre breakdown
          </h2>
          <p className="text-xs text-muted">
            {q.data?.label ?? ""} · sessions from OWNA (Cowork&apos;s data runs), revenue at each centre&apos;s daily rates, staff cost from the roster × pay rates.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface p-1" role="tablist" aria-label="Period">
          {PERIODS.map(([p, l]) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium", period === p ? "bg-card text-foreground shadow-sm" : "text-muted")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <p className="p-4 text-sm text-muted">Loading…</p>
      ) : q.isError ? (
        <p className="p-4 text-sm">Couldn&apos;t load: {q.error.message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Centre</th>
                <th className="p-3 font-medium text-right">Sessions</th>
                <th className="p-3 font-medium text-right">Full</th>
                <th className="p-3 font-medium text-right">Revenue</th>
                <th className="p-3 font-medium text-right">Staff</th>
                <th className="p-3 font-medium text-right">Spend</th>
                <th className="p-3 font-medium text-right">Margin</th>
                <th className="p-3 font-medium text-right">Bank</th>
                <th className="p-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.serviceId;
                return (
                  <Fragment key={r.serviceId}>
                    <tr
                      className="cursor-pointer border-b border-border hover:bg-surface"
                      onClick={() => setOpen(isOpen ? null : r.serviceId)}
                      aria-expanded={isOpen}
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                          {r.name}
                        </span>
                        <span className="ml-5 text-xs text-muted">{r.state}</span>
                      </td>
                      <td className="p-3 text-right">{r.sessions.total || "—"}</td>
                      <td className="p-3 text-right">{r.occupancy != null ? `${r.occupancy}%` : "—"}</td>
                      <td className="p-3 text-right">{r.revenue ? $(r.revenue) : "—"}</td>
                      <td className="p-3 text-right">{r.staffCost ? $(r.staffCost) : "—"}</td>
                      <td className="p-3 text-right">{$(r.purchases + r.groceries + r.materials)}</td>
                      <td
                        className={cn(
                          "p-3 text-right font-medium",
                          r.margin == null ? "text-muted" : r.margin < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {r.margin != null ? `${r.margin}%` : "—"}
                      </td>
                      <td className="p-3 text-right">{$(r.bank)}</td>
                      <td className="p-3 text-xs text-muted">{ago(r.dataAsOf)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-surface/40">
                        <td colSpan={9} className="p-4">
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sessions</p>
                              <p>Before school {r.sessions.bsc} · After school {r.sessions.asc} · Holiday {r.sessions.vc}</p>
                              <p className="text-muted">
                                {r.sessions.permanent} permanent · {r.sessions.casual} casual · {r.sessions.absent} absent
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Staff</p>
                              <p>
                                {r.staffHours}h rostered · {$(r.staffCost)}
                              </p>
                              {r.unpricedHours > 0 && <p className="text-amber-700 dark:text-amber-300">{r.unpricedHours}h with no pay rate on file</p>}
                              <p className="text-muted">Before on-costs (super etc.)</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Spend</p>
                              <p>
                                Purchases {$(r.purchases)} · Groceries {$(r.groceries)} · Materials {$(r.materials)}
                              </p>
                              {r.bankFunded > 0 && <p className="text-muted">+ {$(r.bankFunded)} paid from the bank</p>}
                              {r.costPerSession != null && <p className="text-muted">{$(r.costPerSession)} cost per session</p>}
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Data</p>
                              <p className="flex items-center gap-1">
                                <Database className="h-3.5 w-3.5 text-muted" aria-hidden />
                                {r.dataSource === "cowork" ? "Cowork OWNA run" : r.dataSource === "owna" ? "OWNA sync" : "No feed yet"} · {ago(r.dataAsOf)}
                              </p>
                              <Link href={`/services/${r.serviceId}?tab=finance&sub=budget`} className="text-brand underline">
                                Budget &amp; bank →
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="font-semibold text-foreground">
                <td className="p-3">All centres</td>
                <td className="p-3 text-right">{tot.sessions}</td>
                <td className="p-3" />
                <td className="p-3 text-right">{$(tot.revenue)}</td>
                <td className="p-3 text-right">{$(tot.staff)}</td>
                <td className="p-3 text-right">{$(tot.spend)}</td>
                <td className="p-3" />
                <td className="p-3 text-right">{$(tot.bank)}</td>
                <td className="p-3" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
