"use client";

import { useState } from "react";
import { AlertTriangle, Clock, HelpCircle, ListChecks } from "lucide-react";
import { useAmbassadorRecords } from "@/hooks/useAmbassadors";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "./StatusBadge";
import { RecordDrawer } from "./RecordDrawer";

type Filter = "awaiting" | "conflicts" | "uncertain" | "dueSoon" | "all";

const FILTERS: { key: Filter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "awaiting", label: "Awaiting verification", icon: ListChecks },
  { key: "conflicts", label: "Conflicts", icon: AlertTriangle },
  { key: "uncertain", label: "New-child checks", icon: HelpCircle },
  { key: "dueSoon", label: "Approaching day 28", icon: Clock },
  { key: "all", label: "All records", icon: ListChecks },
];

export function DirectorWorklist() {
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useAmbassadorRecords(
    filter === "awaiting"
      ? { status: "logged" }
      : filter === "conflicts"
        ? { conflictsOnly: true }
        : filter === "uncertain"
          ? { uncertainOnly: true }
          : filter === "dueSoon"
            ? { dueSoon: true }
            : undefined,
  );
  const records = data?.records ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
              filter === f.key
                ? "bg-brand text-white border-brand"
                : "bg-card text-muted border-border hover:text-foreground"
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : records.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted">
          Nothing here — all caught up.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <ul className="divide-y divide-border">
            {records.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(r.id)}
                  className="w-full text-left px-4 sm:px-5 py-3 hover:bg-surface transition-colors flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {r.childInitials}
                      <span className="text-muted font-normal">
                        · {r.service.name}
                      </span>
                      {r.attributionConflict && (
                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                          Conflict
                        </span>
                      )}
                      {r.newChildStatus === "uncertain" && (
                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Confirm new child
                        </span>
                      )}
                    </p>
                    <p className="text-2xs text-muted mt-0.5">
                      {r.creditedEducator
                        ? `Credited: ${r.creditedEducator.name}`
                        : r.attributionConflict
                          ? "Credit disputed"
                          : "Unattributed"}
                      {" · "}
                      {r.paidSessionsAttended}/4 paid sessions
                      {r.regularSessionsPerWeek != null
                        ? ` · ${r.regularSessionsPerWeek}/wk`
                        : " · sessions/wk not set"}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openId && <RecordDrawer recordId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
