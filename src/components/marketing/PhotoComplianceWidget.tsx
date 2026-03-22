"use client";

import { Camera, Loader2, Flame } from "lucide-react";
import { usePhotoCompliance } from "@/hooks/useMarketing";
import { cn } from "@/lib/utils";

function rateColor(rate: number): string {
  if (rate >= 0.85) return "text-green-600";
  if (rate >= 0.5) return "text-amber-600";
  return "text-red-600";
}

function rateBg(rate: number): string {
  if (rate >= 0.85) return "bg-green-100 text-green-700";
  if (rate >= 0.5) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });
}

export function PhotoComplianceWidget() {
  const { data, isLoading } = usePhotoCompliance();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading compliance data...
      </div>
    );
  }

  if (!data || data.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-10">
        <Camera className="mb-2 h-8 w-8 text-muted/50" />
        <p className="text-sm font-medium text-foreground/80">No compliance data</p>
        <p className="mt-1 text-xs text-muted">
          Photo compliance logs will appear here once centres start logging.
        </p>
      </div>
    );
  }

  // Sort by worst compliance first
  const sorted = [...data.services].sort(
    (a, b) => a.complianceRate - b.complianceRate
  );

  // Dates for column headers (most recent first → reverse the days array order)
  const dateHeaders = data.services[0]?.days.map((d) => d.date) ?? [];

  return (
    <div className="space-y-3">
      {/* Overall Rate */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground/80">
            Overall Compliance
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
            rateBg(data.overallRate)
          )}
        >
          {Math.round(data.overallRate * 100)}%
        </span>
      </div>

      {/* Desktop Grid */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-xs font-medium uppercase tracking-wider text-muted">
                <th className="px-3 py-2 text-left">Centre</th>
                {dateHeaders.map((d) => (
                  <th key={d} className="px-2 py-2 text-center whitespace-nowrap">
                    {formatDay(d)}
                  </th>
                ))}
                <th className="px-3 py-2 text-center">Streak</th>
                <th className="px-3 py-2 text-center">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((svc) => (
                <tr key={svc.id} className="hover:bg-surface transition-colors">
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                    {svc.name}
                  </td>
                  {svc.days.map((day) => (
                    <td key={day.date} className="px-2 py-2 text-center">
                      {day.confirmed ? (
                        <span className="text-green-600" title={`Confirmed ${day.confirmedAt ? new Date(day.confirmedAt).toLocaleString("en-AU") : ""}`}>
                          ✅
                        </span>
                      ) : (
                        <span className="text-red-400" title="Not confirmed">
                          ❌
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    {svc.streak > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-orange-600 font-medium text-xs">
                        <Flame className="h-3 w-3" />
                        {svc.streak}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("text-xs font-semibold", rateColor(svc.complianceRate))}>
                      {Math.round(svc.complianceRate * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile List */}
      <div className="sm:hidden space-y-2">
        {sorted.map((svc) => (
          <div
            key={svc.id}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                {svc.name}
              </span>
              <div className="flex items-center gap-2">
                {svc.streak > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-orange-600 font-medium text-xs">
                    <Flame className="h-3 w-3" />
                    {svc.streak}
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                    rateBg(svc.complianceRate)
                  )}
                >
                  {Math.round(svc.complianceRate * 100)}%
                </span>
              </div>
            </div>
            <div className="flex gap-1">
              {svc.days.map((day) => (
                <div
                  key={day.date}
                  className={cn(
                    "flex-1 rounded py-1 text-center text-xs",
                    day.confirmed
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-400"
                  )}
                  title={formatDay(day.date)}
                >
                  {day.confirmed ? "✅" : "❌"}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
