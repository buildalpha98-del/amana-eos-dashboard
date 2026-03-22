"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Building2,
  Loader2,
} from "lucide-react";

interface CentreWorkload {
  id: string;
  name: string;
  code: string;
  state: string | null;
  publishedThisMonth: number;
  pendingReview: number;
  overdueTasks: number;
  openTasks: number;
  drafts: number;
}

type SortKey = "name" | "publishedThisMonth" | "pendingReview" | "overdueTasks" | "openTasks" | "drafts";
type SortDir = "asc" | "desc";

export function CentreWorkloadDashboard({
  onCentreClick,
}: {
  onCentreClick?: (serviceId: string) => void;
}) {
  const [centres, setCentres] = useState<CentreWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("overdueTasks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [stateFilter, setStateFilter] = useState("");

  useEffect(() => {
    fetch("/api/marketing/workload")
      .then((r) => r.json())
      .then((d) => setCentres(d.centres || []))
      .catch(() => setCentres([]))
      .finally(() => setLoading(false));
  }, []);

  const states = useMemo(
    () =>
      [...new Set(centres.map((c) => c.state).filter(Boolean))].sort() as string[],
    [centres]
  );

  const sorted = useMemo(() => {
    const list = stateFilter
      ? centres.filter((c) => c.state === stateFilter)
      : centres;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [centres, sortKey, sortDir, stateFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const totals = useMemo(() => {
    const list = stateFilter
      ? centres.filter((c) => c.state === stateFilter)
      : centres;
    return {
      published: list.reduce((s, c) => s + c.publishedThisMonth, 0),
      pending: list.reduce((s, c) => s + c.pendingReview, 0),
      overdue: list.reduce((s, c) => s + c.overdueTasks, 0),
      open: list.reduce((s, c) => s + c.openTasks, 0),
      drafts: list.reduce((s, c) => s + c.drafts, 0),
    };
  }, [centres, stateFilter]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-brand" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand" />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            Centre Workload
          </h3>
          <span className="text-xs text-muted">
            {sorted.length} centre{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
        {states.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStateFilter("")}
              className={`px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                !stateFilter
                  ? "bg-brand text-white border-brand"
                  : "bg-card text-muted border-border hover:bg-surface"
              }`}
            >
              All
            </button>
            {states.map((st) => (
              <button
                key={st}
                onClick={() => setStateFilter(stateFilter === st ? "" : st)}
                className={`px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                  stateFilter === st
                    ? "bg-brand text-white border-brand"
                    : "bg-card text-muted border-border hover:bg-surface"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Published (Month)" value={totals.published} />
        <SummaryCard label="Pending Review" value={totals.pending} warn={totals.pending > 0} />
        <SummaryCard label="Overdue Tasks" value={totals.overdue} warn={totals.overdue > 0} />
        <SummaryCard label="Open Tasks" value={totals.open} />
        <SummaryCard label="Drafts" value={totals.drafts} />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface/50 text-muted text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                    Centre <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("publishedThisMonth")}>
                    Published <SortIcon col="publishedThisMonth" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("pendingReview")}>
                    Pending <SortIcon col="pendingReview" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("overdueTasks")}>
                    Overdue <SortIcon col="overdueTasks" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("openTasks")}>
                    Open Tasks <SortIcon col="openTasks" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("drafts")}>
                    Drafts <SortIcon col="drafts" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-surface transition-colors ${
                    onCentreClick ? "cursor-pointer" : ""
                  } ${c.overdueTasks > 0 ? "bg-red-50/40" : ""}`}
                  onClick={() => onCentreClick?.(c.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="text-muted text-xs ml-1.5">({c.code})</span>
                        {c.state && (
                          <span className="text-muted text-[10px] ml-1.5 uppercase">
                            {c.state}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-foreground/80">
                    {c.publishedThisMonth}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CountBadge value={c.pendingReview} warn={c.pendingReview > 0} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CountBadge value={c.overdueTasks} warn={c.overdueTasks > 0} />
                  </td>
                  <td className="px-4 py-3 text-center text-foreground/80">
                    {c.openTasks}
                  </td>
                  <td className="px-4 py-3 text-center text-foreground/80">
                    {c.drafts}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted text-sm">
                    No centres found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        warn ? "border-red-200 bg-red-50" : "border-border bg-card"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {warn && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
        <span
          className={`text-xl font-bold ${
            warn ? "text-red-600" : "text-foreground"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function CountBadge({ value, warn }: { value: number; warn?: boolean }) {
  if (value === 0)
    return <span className="text-muted/50">0</span>;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-xs font-medium rounded-full ${
        warn ? "bg-red-100 text-red-700" : "bg-surface text-foreground/80"
      }`}
    >
      {value}
    </span>
  );
}
