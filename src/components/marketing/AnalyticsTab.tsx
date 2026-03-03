"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useMarketingAnalytics } from "@/hooks/useMarketing";

// ── Platform bar colors (matching PlatformBadge) ───────────
const platformBarColors: Record<string, string> = {
  facebook: "bg-blue-500",
  instagram: "bg-pink-500",
  linkedin: "bg-sky-500",
  email: "bg-amber-500",
  newsletter: "bg-teal-500",
  website: "bg-emerald-500",
  flyer: "bg-orange-500",
};

// ── Status card colors (matching StatusBadge post colours) ──
const statusCardColors: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
  in_review: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  approved: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  scheduled: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  published: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
};

const PERIOD_OPTIONS: { label: string; value: number }[] = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
];

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPlatformLabel(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export function AnalyticsTab() {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, error } = useMarketingAnalytics(period);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500">
        {error instanceof Error ? error.message : "Failed to load analytics"}
      </div>
    );
  }

  if (!data) return null;

  // ── Derived values ────────────────────────────────────────
  const platformMax = Math.max(
    ...data.platformBreakdown.map((p) => p._count.id),
    1
  );
  const pillarMax = Math.max(
    ...data.pillarBreakdown.map((p) => p._count.id),
    1
  );
  const monthlyMax = Math.max(
    ...data.monthlyTrend.map((m) => m.posts),
    1
  );

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              period === opt.value
                ? "bg-[#004E64] text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Platform Distribution & Content Pillars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Distribution */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
            <BarChart3 className="h-5 w-5 text-[#004E64]" />
            <h3 className="text-lg font-semibold text-gray-900">
              Platform Distribution
            </h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            {data.platformBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No platform data
              </p>
            ) : (
              data.platformBreakdown.map((item) => {
                const pct = (item._count.id / platformMax) * 100;
                const barColor =
                  platformBarColors[item.platform.toLowerCase()] ??
                  "bg-gray-400";
                return (
                  <div key={item.platform}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">
                        {formatPlatformLabel(item.platform)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {item._count.id}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-3 rounded-full ${barColor} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Content Pillars */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
            <BarChart3 className="h-5 w-5 text-[#004E64]" />
            <h3 className="text-lg font-semibold text-gray-900">
              Content Pillars
            </h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            {data.pillarBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No pillar data
              </p>
            ) : (
              data.pillarBreakdown.map((item) => {
                const pct = (item._count.id / pillarMax) * 100;
                return (
                  <div key={item.pillar}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">
                        {item.pillar || "Uncategorised"}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {item._count.id}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-gray-100">
                      <div
                        className="h-3 rounded-full bg-[#004E64] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
          <TrendingUp className="h-5 w-5 text-[#004E64]" />
          <h3 className="text-lg font-semibold text-gray-900">
            Status Breakdown
          </h3>
        </div>
        <div className="px-6 py-5">
          {data.statusBreakdown.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No status data
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {data.statusBreakdown.map((item) => {
                const colors =
                  statusCardColors[item.status.toLowerCase()] ?? {
                    bg: "bg-gray-50",
                    text: "text-gray-700",
                    border: "border-gray-200",
                  };
                return (
                  <div
                    key={item.status}
                    className={`rounded-xl border p-4 text-center ${colors.bg} ${colors.border}`}
                  >
                    <p className={`text-2xl font-bold ${colors.text}`}>
                      {item._count.id}
                    </p>
                    <p className={`mt-1 text-sm font-medium ${colors.text}`}>
                      {formatStatusLabel(item.status)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
          <TrendingUp className="h-5 w-5 text-[#004E64]" />
          <h3 className="text-lg font-semibold text-gray-900">
            Monthly Trend
          </h3>
        </div>
        <div className="px-6 py-5">
          {data.monthlyTrend.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No trend data
            </p>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {data.monthlyTrend.map((item) => {
                const heightPct = (item.posts / monthlyMax) * 100;
                return (
                  <div
                    key={item.month}
                    className="flex flex-1 flex-col items-center justify-end h-full"
                  >
                    <span className="mb-1 text-xs font-semibold text-gray-700">
                      {item.posts}
                    </span>
                    <div
                      className="w-full max-w-[48px] rounded-t-md bg-[#004E64] transition-all duration-500"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                    <span className="mt-2 text-xs text-gray-500 truncate w-full text-center">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
          <Trophy className="h-5 w-5 text-[#FECE00]" />
          <h3 className="text-lg font-semibold text-gray-900">
            Top 5 Posts by Engagement
          </h3>
        </div>
        {data.leaderboard.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">
            No engagement data
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.leaderboard.slice(0, 5).map((post, idx) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0
                            ? "bg-[#FECE00] text-[#004E64]"
                            : idx === 1
                            ? "bg-gray-200 text-gray-700"
                            : idx === 2
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {post.title}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatPlatformLabel(post.platform)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {post.assignee?.name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {post.totalEngagement.toLocaleString()}
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
