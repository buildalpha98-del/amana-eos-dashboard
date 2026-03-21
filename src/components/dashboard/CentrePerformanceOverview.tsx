"use client";

import Link from "next/link";
import { ChevronRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CentreHealthItem } from "@/hooks/useDashboardData";

interface CentrePerformanceOverviewProps {
  centres: CentreHealthItem[];
  isLoading?: boolean;
}

const statusDot: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const trendIcon = {
  improving: <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />,
  declining: <ArrowDown className="w-3.5 h-3.5 text-red-500" />,
  stable: <Minus className="w-3.5 h-3.5 text-muted" />,
};

export function CentrePerformanceOverview({ centres, isLoading }: CentrePerformanceOverviewProps) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!centres || centres.length === 0) return null;

  // Sort by score ascending so worst-performing centres surface first
  const sorted = [...centres].sort((a, b) => a.score - b.score);

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Centre Performance Overview</h3>
        <Link
          href="/performance"
          className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="pb-2 font-medium">Centre</th>
              <th className="pb-2 font-medium text-center">Health</th>
              <th className="pb-2 font-medium text-center">Attendance %</th>
              <th className="pb-2 font-medium text-center">Compliance</th>
              <th className="pb-2 font-medium text-center">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((c) => (
              <tr key={c.id} className="hover:bg-surface/50 transition-colors">
                <td className="py-2.5">
                  <Link href={`/services/${c.id}`} className="flex items-center gap-2 hover:text-brand transition-colors">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[c.status] || "bg-muted"}`} />
                    <span className="font-medium text-foreground truncate max-w-[180px]">{c.name}</span>
                    <span className="text-xs text-muted">{c.code}</span>
                  </Link>
                </td>
                <td className="py-2.5 text-center">
                  <span className={`font-bold ${
                    c.status === "green" ? "text-emerald-600" : c.status === "amber" ? "text-amber-600" : "text-red-600"
                  }`}>
                    {c.score}
                  </span>
                </td>
                <td className="py-2.5 text-center text-foreground">
                  {c.metrics.occupancy}%
                </td>
                <td className="py-2.5 text-center">
                  <span className={c.metrics.compliance >= 90 ? "text-emerald-600" : c.metrics.compliance >= 70 ? "text-amber-600" : "text-red-600"}>
                    {c.metrics.compliance}%
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center justify-center">
                    {trendIcon[c.trend] || trendIcon.stable}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
