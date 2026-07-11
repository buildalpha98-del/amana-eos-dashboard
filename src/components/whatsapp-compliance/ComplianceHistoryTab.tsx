"use client";

import { useState } from "react";
import { useComplianceHistory } from "@/hooks/useWhatsAppCompliance";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { CoordinatorHistorySidePanel } from "./CoordinatorHistorySidePanel";
import { ArrowUpDown } from "lucide-react";

type SortField = "name" | "rate";
type SortDir = "asc" | "desc";

const STATUS_BG: Record<"green" | "amber" | "red", string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

export function ComplianceHistoryTab() {
  const { data, isLoading, isError, error, refetch } = useComplianceHistory();
  const [sortField, setSortField] = useState<SortField>("rate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [historyServiceId, setHistoryServiceId] = useState<string | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "rate" ? "asc" : "asc");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Couldn't load compliance history" error={error ?? undefined} onRetry={() => refetch()} />;
  }

  if (!data) return null;

  const sorted = [...data.services].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortField === "name") return mul * a.serviceName.localeCompare(b.serviceName);
    return mul * (a.complianceRate - b.complianceRate);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Compliance History</h3>
          <p className="text-xs text-muted mt-0.5">
            Last {data.weeks.length} weeks · target {data.target}/5 · floor {data.floor}/5
          </p>
        </div>
        <div className="flex items-center gap-3 text-2xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Met target
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> Met floor
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Below floor
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left p-3 font-medium text-muted">
                  <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Centre
                    {sortField === "name" && <ArrowUpDown className="w-3 h-3" />}
                  </button>
                </th>
                {data.weeks.map((w) => (
                  <th key={w.weekStart} className="p-2 text-center font-medium text-muted text-xs">
                    <div>W{w.weekNumber}</div>
                    <div className="text-2xs font-normal">{w.weekStart.slice(5)}</div>
                  </th>
                ))}
                <th className="p-3 text-right font-medium text-muted">
                  <button onClick={() => toggleSort("rate")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Rate
                    {sortField === "rate" && <ArrowUpDown className="w-3 h-3" />}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((svc) => (
                <tr key={svc.serviceId} className="border-t border-border hover:bg-surface/50">
                  <td className="p-3 align-middle">
                    <button
                      onClick={() => setHistoryServiceId(svc.serviceId)}
                      className="text-left hover:underline"
                    >
                      <div className="font-medium text-foreground text-xs">{svc.serviceName}</div>
                      {svc.coordinatorName && (
                        <div className="text-2xs text-muted">{svc.coordinatorName}</div>
                      )}
                    </button>
                  </td>
                  {svc.weeks.map((w, i) => (
                    <td key={data.weeks[i].weekStart} className="p-2 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium ${STATUS_BG[w.status]}`}
                        title={`Posted ${w.posted}/${data.target}, not posted ${w.notPosted}, excluded ${w.excluded}, unchecked ${w.notChecked}`}
                      >
                        {w.posted}
                      </span>
                    </td>
                  ))}
                  <td className="p-3 text-right">
                    <span
                      className={`text-xs font-semibold ${
                        svc.complianceRate >= 80
                          ? "text-green-700"
                          : svc.complianceRate >= 60
                          ? "text-amber-700"
                          : "text-red-700"
                      }`}
                    >
                      {svc.complianceRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CoordinatorHistorySidePanel
        serviceId={historyServiceId}
        onClose={() => setHistoryServiceId(null)}
      />
    </div>
  );
}
