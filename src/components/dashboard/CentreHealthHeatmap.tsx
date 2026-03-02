"use client";

import Link from "next/link";
import type { CentreHealthItem } from "@/hooks/useDashboardData";

interface CentreHealthHeatmapProps {
  centres: CentreHealthItem[];
}

const statusColors = {
  green: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
};

export function CentreHealthHeatmap({ centres }: CentreHealthHeatmapProps) {
  const greenCount = centres.filter((c) => c.status === "green").length;
  const amberCount = centres.filter((c) => c.status === "amber").length;
  const redCount = centres.filter((c) => c.status === "red").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Centre Health Overview
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Composite score based on occupancy, compliance, NPS &amp; margin
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
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
          {centres.map((centre) => {
            const colors = statusColors[centre.status];
            return (
              <Link
                key={centre.id}
                href="/performance"
                className={`${colors.bg} ${colors.border} border rounded-lg p-3 hover:shadow-md transition-shadow group`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-xs font-bold text-gray-500 truncate">
                    {centre.code}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                  {centre.name}
                </p>
                <p className={`text-2xl font-bold mt-1 ${colors.text}`}>
                  {centre.score}
                </p>
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
