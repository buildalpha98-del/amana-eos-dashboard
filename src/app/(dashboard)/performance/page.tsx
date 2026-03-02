"use client";

import { usePerformance } from "@/hooks/usePerformance";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV, formatCurrencyCSV } from "@/lib/csv-export";
import {
  Trophy,
  Building2,
  Users,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Star,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreDistributionChart } from "@/components/charts/ScoreDistributionChart";
import { CentreRadarChart } from "@/components/charts/CentreRadarChart";
import { OccupancyComparisonChart } from "@/components/charts/OccupancyComparisonChart";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : score >= 60
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200";

  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold border", color)}>
      {score}
    </span>
  );
}

function MetricCell({ value, suffix, good, threshold }: { value: number | null | undefined; suffix?: string; good?: "high" | "low"; threshold?: number }) {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  const t = threshold || 0;
  const isGood = good === "high" ? value >= t : good === "low" ? value <= t : true;
  return (
    <span className={cn("font-medium", isGood ? "text-gray-900" : "text-red-600")}>
      {typeof value === "number" && suffix === "%" ? `${value.toFixed(1)}%` : value}
      {suffix && suffix !== "%" ? ` ${suffix}` : ""}
    </span>
  );
}

export default function PerformancePage() {
  const { data: centres, isLoading } = usePerformance();

  const topPerformer = centres && centres.length > 0 ? centres[0] : null;
  const needsAttention = centres ? centres.filter((c) => c.score < 60) : [];
  const avgScore = centres && centres.length > 0
    ? Math.round(centres.reduce((s, c) => s + c.score, 0) / centres.length)
    : 0;

  const handleExport = () => {
    if (!centres || centres.length === 0) return;
    exportToCSV(
      centres.map((c: any, index: number) => ({
        rank: index + 1,
        centre: c.name,
        state: c.state || "",
        score: c.score,
        occupancy: c.metrics?.ascOccupancy ?? "",
        revenue: c.financials?.totalRevenue ?? "",
        margin: c.financials?.margin ?? "",
        compliance: c.metrics?.overallCompliance ?? "",
        nps: c.metrics?.parentNps ?? "",
        staff: c.metrics?.totalEducators ?? "",
        issues: c.openIssues,
      })),
      "centre-performance",
      [
        { key: "rank", header: "Rank" },
        { key: "centre", header: "Centre" },
        { key: "state", header: "State" },
        { key: "score", header: "Score" },
        { key: "occupancy", header: "Occupancy %", formatter: (v) => v !== "" ? `${(v as number).toFixed(1)}%` : "" },
        { key: "revenue", header: "Revenue", formatter: (v) => v !== "" ? formatCurrencyCSV(v as number) : "" },
        { key: "margin", header: "Margin %", formatter: (v) => v !== "" ? `${(v as number).toFixed(1)}%` : "" },
        { key: "compliance", header: "Compliance %", formatter: (v) => v !== "" ? `${(v as number).toFixed(1)}%` : "" },
        { key: "nps", header: "NPS" },
        { key: "staff", header: "Staff" },
        { key: "issues", header: "Issues" },
      ]
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Centre Performance</h2>
          <p className="text-gray-500 mt-1">
            Rankings, KPIs, and operational health across all service centres
          </p>
        </div>
        <ExportButton onClick={handleExport} disabled={!centres || centres.length === 0} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-[#004E64]" />
            <p className="text-sm font-medium text-gray-500">Total Centres</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{centres?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-[#FECE00]" />
            <p className="text-sm font-medium text-gray-500">Avg Performance Score</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{avgScore}</p>
          <p className="text-sm text-gray-400 mt-1">out of 100</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-emerald-500" />
            <p className="text-sm font-medium text-gray-500">Top Performer</p>
          </div>
          <p className="text-xl font-bold text-gray-900 truncate">{topPerformer?.name || "—"}</p>
          {topPerformer && <p className="text-sm text-emerald-600 mt-1">Score: {topPerformer.score}</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm font-medium text-gray-500">Needs Attention</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{needsAttention.length}</p>
          <p className="text-sm text-gray-400 mt-1">centres below 60</p>
        </div>
      </div>

      {/* Charts */}
      {centres && centres.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ScoreDistributionChart centres={centres} />
            <CentreRadarChart centres={centres} />
          </div>
          <OccupancyComparisonChart centres={centres} />
        </>
      )}

      {/* Performance League Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Centre Rankings</h3>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading performance data...</div>
        ) : !centres || centres.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No performance data available yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">#</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Centre</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Occupancy</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Revenue</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Margin</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Compliance</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">NPS</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Staff</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {centres.map((centre, index) => (
                  <tr key={centre.id} className={cn(
                    "hover:bg-gray-50 transition-colors",
                    index === 0 ? "bg-emerald-50/30" : "",
                    centre.score < 60 ? "bg-red-50/30" : ""
                  )}>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                        index === 0 ? "bg-[#FECE00] text-[#004E64]" :
                        index === 1 ? "bg-gray-200 text-gray-700" :
                        index === 2 ? "bg-amber-100 text-amber-700" :
                        "text-gray-400"
                      )}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{centre.name}</p>
                        <p className="text-xs text-gray-400">{centre.manager?.name || "No manager"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {centre.state || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge score={centre.score} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.ascOccupancy} suffix="%" good="high" threshold={65} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {centre.financials ? (
                        <span className="font-medium text-gray-900">{formatCurrency(centre.financials.totalRevenue)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {centre.financials ? (
                        <span className={cn(
                          "font-medium",
                          centre.financials.margin > 15 ? "text-emerald-600" :
                          centre.financials.margin > 0 ? "text-amber-600" : "text-red-600"
                        )}>
                          {centre.financials.margin.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.overallCompliance} suffix="%" good="high" threshold={95} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.parentNps} good="high" threshold={50} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.totalEducators} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {centre.openIssues > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {centre.openIssues}
                        </span>
                      ) : (
                        <span className="text-emerald-500 text-xs font-medium">Clear</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
