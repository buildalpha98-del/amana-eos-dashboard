"use client";

import { useSession } from "next-auth/react";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
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
import { DashboardSchoolHealth } from "@/components/dashboard/DashboardSchoolHealth";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";
import { DashboardStateKPI } from "@/components/dashboard/DashboardStateKPI";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { MobileQuickActions } from "@/components/dashboard/MobileQuickActions";

// ─── Section Divider ──────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h3 className="text-xs font-heading font-semibold text-muted uppercase tracking-widest">{label}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

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

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-warm-sm)]">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-success">
            All clear — rocks on track, no overdue to-dos, no critical issues.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-warm-sm)]">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-danger/10 flex items-center justify-center">
        <AlertTriangle className="w-4 h-4 text-danger" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-danger">
          Attention needed:{" "}
          {alerts.map((a, i) => (
            <span key={a.href}>
              {i > 0 && ", "}
              <Link href={a.href} className="underline hover:opacity-80 font-semibold">
                {a.count} {a.label}{a.count !== 1 ? "s" : ""}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <Link
        href={alerts[0].href}
        className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-danger hover:opacity-80 transition-colors"
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Welcome Hero Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            Command Centre
          </h2>
          <p className="text-muted text-base mt-1 line-clamp-2">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"} &mdash;{" "}
            {isServiceScoped
              ? "your centre overview."
              : role === "admin" && session?.user?.state
              ? `overview for ${session.user.state} centres.`
              : "overview across all centres."}
          </p>
        </div>
        {!isServiceScoped && (
          <div className="flex items-center bg-surface rounded-xl p-1 border border-border overflow-x-auto">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-2 sm:px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                  period === opt.value
                    ? "bg-card text-brand shadow-[var(--shadow-warm-sm)] font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Mobile Quick Actions ────────────────────────── */}
      <MobileQuickActions role={role} />

      {isLoading ? (
        <div className="space-y-8">
          {/* Key metrics bar skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2 shadow-[var(--shadow-warm-sm)]">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
          {/* Rocks section skeleton */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3 shadow-[var(--shadow-warm-sm)]">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 p-3 border border-border rounded-lg">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </div>
          {/* Sparklines + Action items skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-card rounded-xl border border-border p-5 space-y-3 shadow-[var(--shadow-warm-sm)]">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 space-y-3 shadow-[var(--shadow-warm-sm)]">
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

          {/* ── State KPI Summary (admin only) ────────────────── */}
          {role === "admin" && session?.user?.state && (
            <WidgetErrorBoundary widgetName="State KPI">
              <DashboardStateKPI
                stateName={session.user.state as string}
                stateCode={session.user.state as string}
                centres={data.centreHealth}
                opsMetrics={data.opsMetrics}
              />
            </WidgetErrorBoundary>
          )}

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

          {/* ── Metrics Section Divider ──────────────────────── */}
          <SectionDivider label="Metrics" />

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

          {/* ── Priorities Section Divider ────────────────────── */}
          <SectionDivider label="Priorities" />

          {/* ── Company & Personal Rocks at a Glance ─────── */}
          <WidgetErrorBoundary widgetName="Rocks">
            <DashboardRocks />
          </WidgetErrorBoundary>

          {/* ── Latest Announcements ───────────────────────── */}
          <WidgetErrorBoundary widgetName="Announcements">
            <DashboardAnnouncements />
          </WidgetErrorBoundary>

          {/* ── Operations Section Divider ────────────────────── */}
          <SectionDivider label="Operations" />

          {/* ── Centre Health Heatmap ──────────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="Centre Health">
              <CentreHealthHeatmap centres={data.centreHealth} networkAvgScore={data.networkAvgScore} />
            </WidgetErrorBoundary>
          )}

          {/* ── School Relationship Health ──────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="School Health">
              <DashboardSchoolHealth />
            </WidgetErrorBoundary>
          )}

          {/* ── NPS Survey Widget ────────────────────────────── */}
          {data.npsSurvey && data.npsSurvey.totalResponses > 0 && (
            <WidgetErrorBoundary widgetName="NPS Survey">
              <div className="bg-card rounded-2xl border border-border p-5 shadow-[var(--shadow-warm)]">
                <h3 className="text-sm font-semibold text-foreground mb-4" title="Net Promoter Score — measures parent satisfaction and loyalty">
                  <span className="cursor-help underline decoration-dotted decoration-muted underline-offset-2">NPS</span> Survey (Last 30 Days)
                </h3>
                {/* Mobile: score on top, breakdown below. Desktop: inline row */}
                <div className="flex items-center gap-4 sm:gap-6 mb-3">
                  <div className="text-center shrink-0">
                    <div
                      className={`text-3xl sm:text-4xl font-bold ${
                        data.npsSurvey.score !== null && data.npsSurvey.score >= 50
                          ? "text-green-600"
                          : data.npsSurvey.score !== null && data.npsSurvey.score >= 0
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {data.npsSurvey.score !== null ? data.npsSurvey.score : "N/A"}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted mt-0.5">Score</div>
                  </div>

                  <div className="flex-1 grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-green-600">{data.npsSurvey.promoters}</div>
                      <div className="text-[10px] sm:text-xs text-muted">Promoters</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-amber-500">{data.npsSurvey.passives}</div>
                      <div className="text-[10px] sm:text-xs text-muted">Passives</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-red-500">{data.npsSurvey.detractors}</div>
                      <div className="text-[10px] sm:text-xs text-muted">Detractors</div>
                    </div>
                  </div>

                  <div className="text-center shrink-0">
                    <div className="text-base sm:text-lg font-semibold text-foreground">{data.npsSurvey.totalResponses}</div>
                    <div className="text-[10px] sm:text-xs text-muted">Total</div>
                  </div>
                </div>

                {/* Progress bar showing distribution */}
                {data.npsSurvey.totalResponses > 0 && (
                  <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-surface">
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(data.npsSurvey.promoters / data.npsSurvey.totalResponses) * 100}%` }}
                    />
                    <div
                      className="bg-amber-400 transition-all"
                      style={{ width: `${(data.npsSurvey.passives / data.npsSurvey.totalResponses) * 100}%` }}
                    />
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${(data.npsSurvey.detractors / data.npsSurvey.totalResponses) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </WidgetErrorBoundary>
          )}

          {/* ── Project To-Dos ─────────────────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="Project To-Dos">
              <DashboardProjectTodos todos={data.projectTodos} />
            </WidgetErrorBoundary>
          )}

          {/* ── Activity Section Divider ──────────────────────── */}
          <SectionDivider label="Activity" />

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

          {/* ── Recent Activity ──────────────────────────────── */}
          {!isServiceScoped && (
            <WidgetErrorBoundary widgetName="Recent Activity">
              <DashboardRecentActivity />
            </WidgetErrorBoundary>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-muted">
          <p>Unable to load dashboard data. Please try again.</p>
        </div>
      )}
    </div>
  );
}
