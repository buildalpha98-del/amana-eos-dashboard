"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { CentreHealthItem } from "@/hooks/useDashboardData";

interface CentreHealthHeatmapProps {
  centres: CentreHealthItem[];
  networkAvgScore?: number;
}

const statusColors = {
  green: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
};

const trendIcons = {
  improving: <ArrowUp className="w-4 h-4 text-emerald-500" />,
  declining: <ArrowDown className="w-4 h-4 text-red-500" />,
  stable: <Minus className="w-4 h-4 text-gray-400" />,
};

const trendLabels = {
  improving: "Improving",
  declining: "Declining",
  stable: "Stable",
};

export function CentreHealthHeatmap({ centres, networkAvgScore }: CentreHealthHeatmapProps) {
  const { greenCount, amberCount, redCount } = useMemo(() => ({
    greenCount: centres.filter((c) => c.status === "green").length,
    amberCount: centres.filter((c) => c.status === "amber").length,
    redCount: centres.filter((c) => c.status === "red").length,
  }), [centres]);

  // Sort centres by score descending for ranking
  const { rankedCentres, rankMap } = useMemo(() => {
    const sorted = [...centres].sort((a, b) => b.score - a.score);
    const map = new Map<string, number>();
    sorted.forEach((c, i) => { map.set(c.id, i + 1); });
    return { rankedCentres: sorted, rankMap: map };
  }, [centres]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Centre Health Overview
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Composite score based on occupancy, compliance, NPS &amp; margin
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          {networkAvgScore !== undefined && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              Avg: {networkAvgScore}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Green ({greenCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Amber ({amberCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            Red ({redCount})
          </span>
        </div>
      </div>

      {centres.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No active centres found.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {rankedCentres.map((centre) => {
            const colors = statusColors[centre.status];
            const trend = centre.trend ?? "stable";
            const rank = rankMap.get(centre.id) ?? 0;
            const delta =
              networkAvgScore !== undefined
                ? centre.score - networkAvgScore
                : undefined;
            const deltaStr =
              delta !== undefined
                ? delta > 0
                  ? `+${delta}`
                  : `${delta}`
                : undefined;
            const deltaColor =
              delta !== undefined
                ? delta > 0
                  ? "text-emerald-600"
                  : delta < 0
                    ? "text-red-600"
                    : "text-gray-400"
                : "";

            return (
              <Link
                key={centre.id}
                href={`/performance?centre=${centre.id}`}
                className={`${colors.bg} ${colors.border} border rounded-lg p-3 hover:shadow-md transition-shadow group relative`}
              >
                {/* Rank badge */}
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-white text-[9px] font-bold shadow-sm">
                  #{rank}
                </span>

                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-xs font-bold text-gray-500 truncate">
                    {centre.code}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                  {centre.name}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <p className={`text-2xl font-bold ${colors.text}`}>
                    {centre.score}
                  </p>
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-0.5">
                      {trendIcons[trend]}
                      {deltaStr !== undefined && (
                        <span className={`text-xs font-semibold ${deltaColor}`}>
                          {deltaStr}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 leading-tight">
                      {deltaStr !== undefined ? "vs avg" : trendLabels[trend]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5 mt-1.5">
                  {[
                    { key: "financial", color: "bg-blue-400" },
                    { key: "operational", color: "bg-emerald-400" },
                    { key: "compliance", color: "bg-purple-400" },
                    { key: "satisfaction", color: "bg-amber-400" },
                    { key: "teamCulture", color: "bg-rose-400" },
                  ].map(({ key, color }) => (
                    <div key={key} className="h-1.5 rounded-full flex-1 bg-gray-200 overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${centre.pillars?.[key as keyof typeof centre.pillars] ?? 0}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                  <span>Occ {centre.metrics.occupancy}%</span>
                  <span>Comp {centre.metrics.compliance}%</span>
                  <span>NPS {centre.metrics.nps}</span>
                  <span>Marg {centre.metrics.margin}%</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
