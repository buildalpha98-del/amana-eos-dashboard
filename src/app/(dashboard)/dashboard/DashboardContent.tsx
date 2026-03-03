"use client";

import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { getCurrentQuarter } from "@/lib/utils";
import { useState } from "react";

// Command Centre components
import { useDashboardData } from "@/hooks/useDashboardData";
import { KeyMetricsBar } from "@/components/dashboard/KeyMetricsBar";
import { DashboardRocks } from "@/components/dashboard/DashboardRocks";
import { DashboardAnnouncements } from "@/components/dashboard/DashboardAnnouncements";
import { CentreHealthHeatmap } from "@/components/dashboard/CentreHealthHeatmap";
import { TrendSparklines } from "@/components/dashboard/TrendSparklines";
import { ActionItemsFeed } from "@/components/dashboard/ActionItemsFeed";
import { DashboardProjectTodos } from "@/components/dashboard/DashboardProjectTodos";

// ─── Main Dashboard Content ─────────────────────────────────

function getPeriodOptions(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const options = [];
  for (let q = 1; q <= 4; q++) {
    options.push({ value: `Q${q}-${year}`, label: `Q${q} ${year}` });
  }
  options.push({ value: `yearly-${year}`, label: `Full Year ${year}` });
  return options;
}

export function DashboardContent() {
  const { data: session } = useSession();
  const quarter = getCurrentQuarter();
  const [period, setPeriod] = useState(quarter);

  const periodOptions = getPeriodOptions();
  const { data, isLoading } = useDashboardData(period);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Command Centre
          </h2>
          <p className="text-gray-500 mt-1">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"} &mdash;{" "}
            overview across all centres.
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                period === opt.value
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#004E64] animate-spin" />
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      ) : data ? (
        <>
          {/* ── Key Metrics Bar ─────────────────────────────── */}
          <KeyMetricsBar metrics={data.keyMetrics} />

          {/* ── Company & Personal Rocks at a Glance ─────── */}
          <DashboardRocks />

          {/* ── Latest Announcements ───────────────────────── */}
          <DashboardAnnouncements />

          {/* ── Centre Health Heatmap ──────────────────────── */}
          <CentreHealthHeatmap centres={data.centreHealth} networkAvgScore={data.networkAvgScore} />

          {/* ── Project To-Dos ─────────────────────────────── */}
          <DashboardProjectTodos todos={data.projectTodos} />

          {/* ── Sparklines + Action Items ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <TrendSparklines
                revenue={data.trends.revenue}
                enrolments={data.trends.enrolments}
                tickets={data.trends.tickets}
              />
            </div>
            <div className="lg:col-span-2">
              <ActionItemsFeed
                overdueTodos={data.actionItems.overdueTodos}
                unassignedTickets={data.actionItems.unassignedTickets}
                idsIssues={data.actionItems.idsIssues}
                overdueRocks={data.actionItems.overdueRocks}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p>Unable to load dashboard data. Please try again.</p>
        </div>
      )}
    </div>
  );
}
