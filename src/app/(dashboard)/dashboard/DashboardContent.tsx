"use client";

import { useSession } from "next-auth/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
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
import { StaffDashboard } from "@/components/dashboard/StaffDashboard";
import { StaffingAlerts } from "@/components/dashboard/StaffingAlerts";
import { TodaysOps } from "@/components/dashboard/TodaysOps";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";

// ─── Alert Banner ───────────────────────────────────────────

function AlertBanner({
  overdueTodos,
  criticalIssues,
  overdueRocks,
}: {
  overdueTodos: number;
  criticalIssues: number;
  overdueRocks: number;
}) {
  const alerts: { label: string; count: number; href: string }[] = [];
  if (overdueTodos > 0) alerts.push({ label: "overdue to-do", count: overdueTodos, href: "/todos" });
  if (criticalIssues > 0) alerts.push({ label: "critical issue", count: criticalIssues, href: "/issues" });
  if (overdueRocks > 0) alerts.push({ label: "off-track rock", count: overdueRocks, href: "/rocks" });

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
        <AlertTriangle className="w-4 h-4 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">
          Attention needed:{" "}
          {alerts.map((a, i) => (
            <span key={a.href}>
              {i > 0 && ", "}
              <Link href={a.href} className="underline hover:text-red-900 font-semibold">
                {a.count} {a.label}{a.count !== 1 ? "s" : ""}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <Link
        href={alerts[0].href}
        className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 transition-colors"
      >
        Review <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

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

  const role = (session?.user?.role as string) || "";
  const isServiceScoped = role === "staff" || role === "member";

  if (isServiceScoped) {
    return <StaffDashboard />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Command Centre
          </h2>
          <p className="text-gray-500 mt-1 line-clamp-2">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"} &mdash;{" "}
            {isServiceScoped ? "your centre overview." : "overview across all centres."}
          </p>
        </div>
        {!isServiceScoped && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  period === opt.value
                    ? "bg-white text-brand shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {/* Key metrics bar skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
          {/* Rocks section skeleton */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 p-3 border border-gray-100 rounded-lg">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </div>
          {/* Sparklines + Action items skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <Skeleton className="h-5 w-28" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : data ? (
        <>
          {/* ── Alert Banner ────────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Alert Banner">
            <AlertBanner
              overdueTodos={data.actionItems.overdueTodos.length}
              criticalIssues={data.actionItems.idsIssues.filter((i) => i.priority === "critical").length}
              overdueRocks={data.actionItems.overdueRocks.length}
            />
          </WidgetErrorBoundary>

          {/* ── Staffing Alerts ──────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Staffing Alerts">
            <StaffingAlerts />
          </WidgetErrorBoundary>

          {/* ── Today's Operations ────────────────────────────── */}
          {!isServiceScoped && data.todaysOps.length > 0 && (
            <WidgetErrorBoundary widgetName="Today's Operations">
              <TodaysOps centres={data.todaysOps} />
            </WidgetErrorBoundary>
          )}

          {/* ── Key Metrics Bar ─────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Key Metrics">
            {isServiceScoped ? (
              <KeyMetricsBar
                metrics={{
                  ...data.keyMetrics,
                  totalRevenue: 0,
                  openTickets: 0,
                }}
                hideFinancials
              />
            ) : (
              <KeyMetricsBar
                metrics={data.keyMetrics}
                opsMetrics={data.opsMetrics}
              />
            )}
          </WidgetErrorBoundary>

          {/* ── Company & Personal Rocks at a Glance ─────── */}
          <WidgetErrorBoundary widgetName="Rocks">
            <DashboardRocks />
          </WidgetErrorBoundary>

          {/* ── Latest Announcements ───────────────────────── */}
          <WidgetErrorBoundary widgetName="Announcements">
            <DashboardAnnouncements />
          </WidgetErrorBoundary>

          {/* ── Centre Health Heatmap ──────────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="Centre Health">
              <CentreHealthHeatmap centres={data.centreHealth} networkAvgScore={data.networkAvgScore} />
            </WidgetErrorBoundary>
          )}

          {/* ── Project To-Dos ─────────────────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="Project To-Dos">
              <DashboardProjectTodos todos={data.projectTodos} />
            </WidgetErrorBoundary>
          )}

          {/* ── Sparklines + Action Items ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <WidgetErrorBoundary widgetName="Trends">
                <TrendSparklines
                  revenue={isServiceScoped ? [] : data.trends.revenue}
                  enrolments={data.trends.enrolments}
                  tickets={isServiceScoped ? [] : data.trends.tickets}
                />
              </WidgetErrorBoundary>
            </div>
            <div className="lg:col-span-2">
              <WidgetErrorBoundary widgetName="Action Items">
                <ActionItemsFeed
                  overdueTodos={data.actionItems.overdueTodos}
                  unassignedTickets={isServiceScoped ? [] : data.actionItems.unassignedTickets}
                  idsIssues={data.actionItems.idsIssues}
                  overdueRocks={isServiceScoped ? [] : data.actionItems.overdueRocks}
                />
              </WidgetErrorBoundary>
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
