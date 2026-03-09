"use client";

import { useState } from "react";
import { useHealthScore } from "@/hooks/useHealthScore";
import { PILLAR_LABELS } from "@/lib/health-score";
import {
  X,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthScoreDetailProps {
  serviceId: string;
  onClose: () => void;
}

// ─── Label Mappings ─────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  margin: "Profit Margin",
  budgetVariance: "Budget Variance",
  revenuePerChild: "Revenue per Child",
  bscOccupancy: "BSC Occupancy",
  ascOccupancy: "ASC Occupancy",
  rocksCompletion: "Rocks on Track",
  todosOnTime: "Todos on Time",
  overallCompliance: "Overall Compliance",
  wwccCompliance: "WWCC Compliance",
  firstAidCompliance: "First Aid Compliance",
  ratioCompliance: "Ratio Compliance",
  incidentFree: "Incident Free",
  nqsRating: "NQS Rating",
  parentNps: "Parent NPS",
  complaintFree: "Complaint Free",
  ticketResolution: "Ticket Resolution",
  lowTurnover: "Low Turnover",
  issuesClear: "Issues Cleared",
};

const PILLAR_SHORT_LABELS: Record<string, string> = {
  financial: "Financial",
  operational: "Ops",
  compliance: "Compliance",
  satisfaction: "Satisfaction",
  teamCulture: "Team",
};

const PILLAR_KEYS = ["financial", "operational", "compliance", "satisfaction", "teamCulture"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getSeverityConfig(severity: "critical" | "warning" | "info") {
  switch (severity) {
    case "critical":
      return {
        borderColor: "border-l-red-500",
        bgColor: "bg-red-50",
        icon: <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
        textColor: "text-red-700",
      };
    case "warning":
      return {
        borderColor: "border-l-amber-500",
        bgColor: "bg-amber-50",
        icon: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
        textColor: "text-amber-700",
      };
    case "info":
      return {
        borderColor: "border-l-blue-500",
        bgColor: "bg-blue-50",
        icon: <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />,
        textColor: "text-blue-700",
      };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function HealthScoreDetail({ serviceId, onClose }: HealthScoreDetailProps) {
  const { data, isLoading, error } = useHealthScore(serviceId);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());

  const togglePillar = (key: string) => {
    setExpandedPillars((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Format history for chart
  const chartData = data?.history?.map((h) => ({
    month: new Date(h.periodStart).toLocaleDateString("en-AU", { month: "short" }),
    score: h.overallScore,
  })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading health score...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Centre Health Score</h2>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">Failed to load health score data.</p>
            </div>
          </div>
        )}

        {/* Data Loaded */}
        {data && (
          <div className="p-4 md:p-6 space-y-6">
            {/* ── Header ────────────────────────────────────────── */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Centre Health Score</h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-3xl md:text-4xl font-bold ${getScoreColor(data.current.overallScore)}`}>
                    {data.current.overallScore}
                  </span>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      {data.current.trend === "improving" ? (
                        <ArrowUp className="w-4 h-4 text-emerald-500" />
                      ) : data.current.trend === "declining" ? (
                        <ArrowDown className="w-4 h-4 text-red-500" />
                      ) : (
                        <Minus className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm text-gray-500 capitalize">{data.current.trend}</span>
                    </div>
                    {data.networkComparison && (
                      <span className="text-xs font-medium text-gray-400">
                        #{data.networkComparison.rank} of {data.networkComparison.totalCentres}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* ── Pillar Cards Row ──────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {PILLAR_KEYS.map((key) => {
                const score = data.current.pillars[key]?.score ?? 0;
                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs font-medium text-gray-500 mb-1 truncate">
                      {PILLAR_SHORT_LABELS[key]}
                    </p>
                    <p className={`text-xl font-bold ${getScoreColor(score)}`}>{score}</p>
                    <div className="mt-2 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getScoreBgColor(score)}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Sub-Metric Breakdown ──────────────────────────── */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pillar Breakdown</h3>
              <div className="space-y-1">
                {PILLAR_KEYS.map((key) => {
                  const pillar = data.current.pillars[key];
                  const isExpanded = expandedPillars.has(key);
                  const breakdown = pillar?.breakdown ?? {};
                  const score = pillar?.score ?? 0;

                  return (
                    <div key={key} className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => togglePillar(key)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {PILLAR_LABELS[key] || key}
                          </span>
                        </div>
                        <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                      </button>
                      {isExpanded && Object.keys(breakdown).length > 0 && (
                        <div className="px-4 pb-3 border-t border-gray-100">
                          {Object.entries(breakdown).map(([metricKey, value]) => (
                            <div key={metricKey} className="flex items-center justify-between py-2">
                              <span className="text-sm text-gray-600">
                                {METRIC_LABELS[metricKey] || metricKey}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-brand rounded-full"
                                    style={{ width: `${value}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium w-8 text-right">{value}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Trend Chart ───────────────────────────────────── */}
            {chartData.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Score Trend</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#004E64"
                        strokeWidth={2}
                        dot={{ fill: "#004E64", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── Network Comparison ────────────────────────────── */}
            {data.networkComparison?.pillarComparison && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Network Comparison</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-4 mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-brand" />
                      <span className="text-xs text-gray-600">Centre</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-gray-300" />
                      <span className="text-xs text-gray-600">Network Avg</span>
                    </div>
                  </div>

                  {Object.entries(data.networkComparison.pillarComparison).map(([key, vals]) => (
                    <div key={key}>
                      <div className="text-xs text-gray-500 mb-1">{PILLAR_LABELS[key] || key}</div>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 h-3 bg-gray-100 rounded-full relative overflow-hidden">
                          <div
                            className="absolute h-full bg-gray-300 rounded-full"
                            style={{ width: `${vals.networkAvg}%` }}
                          />
                          <div
                            className="absolute h-full bg-brand rounded-full"
                            style={{ width: `${vals.centre}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6">{vals.centre}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recommendations ───────────────────────────────── */}
            {data.recommendations && data.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Recommendations ({data.recommendations.length})
                </h3>
                <div className="space-y-2">
                  {data.recommendations.map((rec, idx) => {
                    const config = getSeverityConfig(rec.severity);
                    const progress = rec.targetValue > 0
                      ? Math.min(100, Math.round((rec.currentValue / rec.targetValue) * 100))
                      : 0;

                    return (
                      <div
                        key={idx}
                        className={`border-l-4 ${config.borderColor} ${config.bgColor} rounded-r-lg p-3`}
                      >
                        <div className="flex items-start gap-2">
                          {config.icon}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-semibold ${config.textColor}`}>
                                {rec.pillarLabel || PILLAR_LABELS[rec.pillar] || rec.pillar}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{rec.message}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand rounded-full"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">
                                {rec.currentValue} / {rec.targetValue}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
