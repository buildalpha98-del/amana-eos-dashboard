"use client";

import { useState } from "react";
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
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

const ScoreDistributionChart = dynamic(() => import("@/components/charts/ScoreDistributionChart").then((m) => m.ScoreDistributionChart), { loading: () => <Skeleton className="h-64 w-full" /> });
const CentreRadarChart = dynamic(() => import("@/components/charts/CentreRadarChart").then((m) => m.CentreRadarChart), { loading: () => <Skeleton className="h-64 w-full" /> });
const OccupancyComparisonChart = dynamic(() => import("@/components/charts/OccupancyComparisonChart").then((m) => m.OccupancyComparisonChart), { loading: () => <Skeleton className="h-64 w-full" /> });
const ScoreTrendChart = dynamic(() => import("@/components/charts/ScoreTrendChart").then((m) => m.ScoreTrendChart), { loading: () => <Skeleton className="h-64 w-full" /> });
import { HealthScoreDetail } from "@/components/performance/HealthScoreDetail";
import { CentreLeaderboard } from "@/components/performance/CentreLeaderboard";
import { CentreComparison } from "@/components/performance/CentreComparison";
import { RegionalRollup } from "@/components/performance/RegionalRollup";
import { LayoutGrid, ListOrdered, BarChart3 } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { AiButton } from "@/components/ui/AiButton";
import { TrendInsightsWidget } from "@/components/trends/TrendInsightsWidget";

type ViewMode = "centres" | "leaderboard" | "compare";

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
  if (value === null || value === undefined) return <span className="text-muted/50">—</span>;
  const t = threshold || 0;
  const isGood = good === "high" ? value >= t : good === "low" ? value <= t : true;
  return (
    <span className={cn("font-medium", isGood ? "text-foreground" : "text-red-600")}>
      {typeof value === "number" && suffix === "%" ? `${value.toFixed(1)}%` : value}
      {suffix && suffix !== "%" ? ` ${suffix}` : ""}
    </span>
  );
}

export default function PerformancePage() {
  const { data: centres, isLoading, error, refetch } = usePerformance();
  const [sortBy, setSortBy] = useState<string>("overall");
  const [selectedCentreId, setSelectedCentreId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("centres");
  const [aiDigest, setAiDigest] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);

  const topPerformer = centres && centres.length > 0 ? centres[0] : null;
  const needsAttention = centres ? centres.filter((c) => c.score < 60) : [];
  const avgScore = centres && centres.length > 0
    ? Math.round(centres.reduce((s, c) => s + c.score, 0) / centres.length)
    : 0;

  const sortOptions = [
    { value: "overall", label: "Overall Score" },
    { value: "financial", label: "Financial" },
    { value: "operational", label: "Operational" },
    { value: "compliance", label: "Compliance" },
    { value: "satisfaction", label: "Satisfaction" },
    { value: "teamCulture", label: "Team & Culture" },
  ];

  const sortedCentres = centres ? [...centres].sort((a, b) => {
    if (sortBy === "overall") return b.score - a.score;
    return (b.pillars?.[sortBy as keyof typeof b.pillars] ?? 0) - (a.pillars?.[sortBy as keyof typeof a.pillars] ?? 0);
  }) : [];

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

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Centre Performance</h2>
          <p className="text-sm text-muted mt-1 line-clamp-2">
            Rankings, KPIs, and operational health across all centres
          </p>
        </div>
        <ErrorState
          title="Failed to load performance"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Centre Performance</h2>
          <p className="text-sm text-muted mt-1 line-clamp-2">
            Rankings, KPIs, and operational health across all centres
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
            <button
              onClick={() => { setViewMode("centres"); setStateFilter(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                viewMode === "centres"
                  ? "bg-card text-brand shadow-sm"
                  : "text-muted hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Centres</span>
            </button>
            <button
              onClick={() => setViewMode("leaderboard")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                viewMode === "leaderboard"
                  ? "bg-card text-brand shadow-sm"
                  : "text-muted hover:text-foreground"
              )}
            >
              <ListOrdered className="w-4 h-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </button>
            <button
              onClick={() => { setViewMode("compare"); setStateFilter(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                viewMode === "compare"
                  ? "bg-card text-brand shadow-sm"
                  : "text-muted hover:text-foreground"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Compare</span>
            </button>
          </div>
          <AiButton
            templateSlug="performance/digest"
            variables={{
              centreScores: centres?.slice(0, 15).map((c: any) => `${c.name}: ${c.score}/100`).join(", ") || "No data",
              topPerformers: centres?.slice(0, 3).map((c: any) => `${c.name} (${c.score})`).join(", ") || "None",
              bottomPerformers: centres?.slice(-3).map((c: any) => `${c.name} (${c.score})`).join(", ") || "None",
              trends: "Current period data",
            }}
            onResult={(text) => setAiDigest(text)}
            label="AI Digest"
            size="sm"
            section="performance"
            disabled={!centres || centres.length === 0}
          />
          <ExportButton onClick={handleExport} disabled={!centres || centres.length === 0} />
        </div>
      </div>

      {/* AI Performance Digest */}
      {aiDigest && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-purple-800">AI Performance Digest</h3>
            <button onClick={() => setAiDigest(null)} className="text-purple-400 hover:text-purple-600">
              <ChevronDown className="w-4 h-4 rotate-180" />
            </button>
          </div>
          <div className="text-sm text-purple-900 whitespace-pre-wrap">{aiDigest}</div>
        </div>
      )}

      {/* Trend Insights */}
      <TrendInsightsWidget />

      {/* ═══ Centres View (existing) ═══ */}
      {viewMode === "centres" && (
      <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-brand" />
            <p className="text-sm font-medium text-muted">Total Centres</p>
          </div>
          <p className="text-3xl font-bold text-foreground">{centres?.length || 0}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-accent" />
            <p className="text-sm font-medium text-muted">Avg Performance Score</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground">{avgScore}</p>
            <span className="text-sm text-muted">/ 100</span>
          </div>
          <p className="text-sm text-muted mt-1">out of 100</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-emerald-500" />
            <p className="text-sm font-medium text-muted">Top Performer</p>
          </div>
          <p className="text-xl font-bold text-foreground truncate">{topPerformer?.name || "—"}</p>
          {topPerformer && <p className="text-sm text-emerald-600 mt-1">Score: {topPerformer.score}</p>}
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm font-medium text-muted">Needs Attention</p>
          </div>
          <p className="text-3xl font-bold text-foreground">{needsAttention.length}</p>
          <p className="text-sm text-muted mt-1">centres below 60</p>
        </div>
      </div>

      {/* Charts */}
      {centres && centres.length > 0 && (
        <>
          <ScoreTrendChart />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ScoreDistributionChart centres={centres} />
            <CentreRadarChart centres={centres} />
          </div>
          <OccupancyComparisonChart centres={centres} />
        </>
      )}

      {/* Performance League Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base md:text-lg font-semibold text-foreground">Centre Rankings</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : !sortedCentres || sortedCentres.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand/5 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-brand/30" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              No performance data available yet
            </h3>
            <p className="text-muted mt-2 max-w-md">
              Performance scores will appear here once service centres have been
              set up and start reporting data.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface/50 text-left">
                  <th className="px-3 md:px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider w-10">#</th>
                  <th className="px-3 md:px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Centre</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">State</th>
                  <th className="px-3 md:px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Score</th>
                  <th className="px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Trend</th>
                  <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Fin</th>
                  <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Ops</th>
                  <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Comp</th>
                  <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Sat</th>
                  <th className="hidden md:table-cell px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-center">Team</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Occupancy</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Revenue</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Margin</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Compliance</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">NPS</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Staff</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedCentres.map((centre, index) => (
                  <tr
                    key={centre.id}
                    onClick={() => setSelectedCentreId(centre.id)}
                    className={cn(
                      "hover:bg-surface transition-colors cursor-pointer",
                      index === 0 ? "bg-emerald-50/30" : "",
                      centre.score < 60 ? "bg-red-50/30" : ""
                    )}
                  >
                    <td className="px-3 md:px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                        index === 0 ? "bg-accent text-brand" :
                        index === 1 ? "bg-border text-foreground/80" :
                        index === 2 ? "bg-amber-100 text-amber-700" :
                        "text-muted"
                      )}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground text-sm">{centre.name}</p>
                        <p className="text-xs text-muted hidden sm:block">{centre.manager?.name || "No manager"}</p>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-foreground/80">
                        {centre.state || "—"}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-center">
                      <ScoreBadge score={centre.score} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {centre.trend === "improving" ? (
                        <ArrowUp className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : centre.trend === "declining" ? (
                        <ArrowDown className="w-4 h-4 text-red-500 mx-auto" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted mx-auto" />
                      )}
                    </td>
                    {["financial", "operational", "compliance", "satisfaction", "teamCulture"].map((key) => {
                      const val = centre.pillars?.[key as keyof typeof centre.pillars] ?? 0;
                      const color = val >= 75 ? "bg-emerald-100 text-emerald-700" : val >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                      return (
                        <td key={key} className="hidden md:table-cell px-3 py-3 text-center">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>{val}</span>
                        </td>
                      );
                    })}
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.ascOccupancy} suffix="%" good="high" threshold={65} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      {centre.financials ? (
                        <span className="font-medium text-foreground">{formatCurrency(centre.financials.totalRevenue)}</span>
                      ) : (
                        <span className="text-muted/50">—</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      {centre.financials ? (
                        <span className={cn(
                          "font-medium",
                          centre.financials.margin > 15 ? "text-emerald-600" :
                          centre.financials.margin > 0 ? "text-amber-600" : "text-red-600"
                        )}>
                          {centre.financials.margin.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted/50">—</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.overallCompliance} suffix="%" good="high" threshold={95} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.parentNps} good="high" threshold={50} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
                      <MetricCell value={centre.metrics?.totalEducators} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-right">
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

      {selectedCentreId && (
        <HealthScoreDetail
          serviceId={selectedCentreId}
          onClose={() => setSelectedCentreId(null)}
        />
      )}
      </>
      )}

      {/* ═══ Leaderboard View ═══ */}
      {viewMode === "leaderboard" && (
        <>
          {isLoading ? (
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : centres && centres.length > 0 ? (
            <>
              <RegionalRollup
                centres={centres}
                activeState={stateFilter}
                onStateSelect={setStateFilter}
              />
              <CentreLeaderboard centres={centres} stateFilter={stateFilter} />
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <Building2 className="w-12 h-12 text-muted/50 mx-auto mb-3" />
              <p className="text-muted">No performance data available yet.</p>
            </div>
          )}
        </>
      )}

      {/* ═══ Compare View ═══ */}
      {viewMode === "compare" && <CentreComparison />}
    </div>
  );
}
