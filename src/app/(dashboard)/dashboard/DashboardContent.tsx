"use client";

import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Mountain,
  AlertCircle,
  Inbox,
  Plus,
  ShieldAlert,
  UserPlus,
  CalendarCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
import { getCurrentQuarter } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { InfoSnippets } from "@/components/dashboard/InfoSnippets";
import { DashboardSchoolHealth } from "@/components/dashboard/DashboardSchoolHealth";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";
import { DashboardStateKPI } from "@/components/dashboard/DashboardStateKPI";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { MobileQuickActions } from "@/components/dashboard/MobileQuickActions";
import { AiDraftsWidget } from "@/components/dashboard/AiDraftsWidget";
import { ServicesBelowRatioCard } from "@/components/dashboard/ServicesBelowRatioCard";
import { DashboardTodayStrip } from "@/components/dashboard/DashboardTodayStrip";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

// Role-specific widgets
import { CentrePerformanceOverview } from "@/components/dashboard/CentrePerformanceOverview";
import { L10PrepWidget } from "@/components/dashboard/L10PrepWidget";
import { ComplianceOverviewWidget } from "@/components/dashboard/ComplianceOverviewWidget";
import { StaffOnboardingWidget } from "@/components/dashboard/StaffOnboardingWidget";
import { MarketingDashboard } from "@/components/dashboard/MarketingDashboard";

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

// ─── Time-of-Day Greeting ───────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Priority Stats Row ─────────────────────────────────────

function PriorityStats({
  overdueTodos,
  offTrackRocks,
  openIssues,
  pendingQueue,
}: {
  overdueTodos: number;
  offTrackRocks: number;
  openIssues: number;
  pendingQueue: number;
}) {
  const stats = [
    { label: "Overdue To-Dos", value: overdueTodos, icon: ClipboardList, href: "/todos", color: overdueTodos > 0 ? "text-danger" : "text-success" },
    { label: "Off-Track Rocks", value: offTrackRocks, icon: Mountain, href: "/rocks", color: offTrackRocks > 0 ? "text-warning" : "text-success" },
    { label: "Open Issues", value: openIssues, icon: AlertCircle, href: "/issues", color: openIssues > 0 ? "text-warning" : "text-success" },
    { label: "Pending Queue", value: pendingQueue, icon: Inbox, href: "/queue", color: pendingQueue > 0 ? "text-brand" : "text-muted" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.label}
            href={s.href}
            className="bg-card rounded-xl border border-border p-3 flex items-center gap-3 hover:border-brand/30 transition-colors shadow-[var(--shadow-warm-sm)]"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface flex items-center justify-center">
              <Icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <div className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-muted mt-0.5 truncate">{s.label}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Quick Action Buttons ───────────────────────────────────

function QuickActionButtons() {
  const actions = [
    { label: "Log Incident", href: "/incidents", icon: ShieldAlert },
    { label: "Create To-Do", href: "/todos", icon: Plus },
    { label: "New Enquiry", href: "/enquiries", icon: UserPlus },
    { label: "Record Attendance", href: "/services", icon: CalendarCheck },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors whitespace-nowrap bg-card shadow-[var(--shadow-warm-sm)]"
          >
            <Icon className="w-3.5 h-3.5" />
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Role Helpers ────────────────────────────────────────────

type DashboardRole = "owner" | "head_office" | "admin" | "coordinator" | "member" | "staff" | "marketing";

function getDashboardRole(role: string): DashboardRole {
  if (["owner", "head_office", "admin", "coordinator", "member", "staff", "marketing"].includes(role)) {
    return role as DashboardRole;
  }
  return "staff";
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

  const role = getDashboardRole((session?.user?.role as string) || "");

  // Staff (educator) and Marketing get their own dedicated dashboards
  if (role === "staff") {
    return <StaffDashboard />;
  }

  if (role === "marketing") {
    return <MarketingDashboard />;
  }

  // member (Centre Director) gets the StaffDashboard which already
  // includes DirectorAnalyticsWidget — keep existing behavior
  if (role === "member") {
    return <StaffDashboard />;
  }

  // From here on: owner, head_office, admin, coordinator see the Command Centre
  return <CommandCentreDashboard role={role} period={period} setPeriod={setPeriod} periodOptions={periodOptions} />;
}

// ─── Command Centre Dashboard (owner, head_office, admin, coordinator) ──

function CommandCentreDashboard({
  role,
  period,
  setPeriod,
  periodOptions,
}: {
  role: DashboardRole;
  period: string;
  setPeriod: (p: string) => void;
  periodOptions: { value: string; label: string }[];
}) {
  const { data: session } = useSession();
  const { data, isLoading } = useDashboardData(period);

  // Fetch pending queue count for priority stats
  const { data: queueData } = useQuery<{ reports: unknown[] }>({
    queryKey: ["queue-count"],
    queryFn: async () => {
      const res = await fetch("/api/queue");
      if (!res.ok) return { reports: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
  const pendingQueueCount = queueData?.reports?.length ?? 0;

  const greeting = useMemo(() => getGreeting(), []);
  const todayDate = useMemo(() => formatTodayDate(), []);
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const isOwnerOrHO = role === "owner" || role === "head_office";
  const isAdmin = role === "admin";
  const isCoordinator = role === "coordinator";

  const v2 = useStaffV2Flag();

  return (
    <div
      {...(v2 ? { "data-v2": "staff" } : {})}
      className="max-w-7xl mx-auto space-y-8"
    >
      {/* ── Greeting + Priority Stats + Quick Actions ──────── */}
      <div className="space-y-4 animate-widget-in">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            {greeting}, {firstName}
          </h2>
          <p className="text-muted text-sm mt-1">{todayDate}</p>
        </div>

        {/* v2: compact "Today strip" at top */}
        {v2 && data && (
          <DashboardTodayStrip
            counts={{
              overdueTodos: data.actionItems.overdueTodos.length,
              offTrackRocks: data.actionItems.overdueRocks.length,
              openIssues: data.actionItems.idsIssues.length,
              pendingQueue: pendingQueueCount,
            }}
          />
        )}

        {!v2 && data && (
          <PriorityStats
            overdueTodos={data.actionItems.overdueTodos.length}
            offTrackRocks={data.actionItems.overdueRocks.length}
            openIssues={data.actionItems.idsIssues.length}
            pendingQueue={pendingQueueCount}
          />
        )}

        <QuickActionButtons />

        {/* AI Drafts Ready Widget */}
        <WidgetErrorBoundary widgetName="AI Drafts">
          <AiDraftsWidget />
        </WidgetErrorBoundary>

        {/* Services below ratio — live alert from hourly snapshots */}
        <WidgetErrorBoundary widgetName="Below Ratio">
          <ServicesBelowRatioCard />
        </WidgetErrorBoundary>
      </div>

      {/* Welcome Hero Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-heading font-semibold tracking-tight text-foreground">
            Command Centre
          </h2>
          <p className="text-muted text-sm mt-0.5 line-clamp-2">
            {isAdmin && session?.user?.state
              ? `Overview for ${session.user.state} centres.`
              : isCoordinator
                ? "Overview for your centres."
                : "Overview across all centres."}
          </p>
        </div>
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
        <div className="contents stagger-children">
          {/* ── Alert Banner ────────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Alert Banner">
            <AlertBanner
              overdueTodos={data.actionItems.overdueTodos.length}
              criticalIssues={data.actionItems.idsIssues.filter((i) => i.priority === "critical").length}
              overdueRocks={data.actionItems.overdueRocks.length}
            />
          </WidgetErrorBoundary>

          {/* ── State KPI Summary (admin only) ────────────────── */}
          {isAdmin && session?.user?.state && (
            <WidgetErrorBoundary widgetName="State KPI">
              <DashboardStateKPI
                stateName={session.user.state as string}
                stateCode={session.user.state as string}
                centres={data.centreHealth}
                opsMetrics={data.opsMetrics}
              />
            </WidgetErrorBoundary>
          )}

          {/* ── Owner/HO: Centre Performance Overview ─────────── */}
          {isOwnerOrHO && (
            <WidgetErrorBoundary widgetName="Centre Performance Overview">
              <CentrePerformanceOverview centres={data.centreHealth} />
            </WidgetErrorBoundary>
          )}

          {/* ── Owner/HO: L10 Prep Summary ───────────────────── */}
          {isOwnerOrHO && (
            <WidgetErrorBoundary widgetName="L10 Prep">
              <L10PrepWidget />
            </WidgetErrorBoundary>
          )}

          {/* ── Admin: Compliance Overview ─────────────────────── */}
          {isAdmin && (
            <WidgetErrorBoundary widgetName="Compliance Overview">
              <ComplianceOverviewWidget />
            </WidgetErrorBoundary>
          )}

          {/* ── Admin: Staff Onboarding Progress ──────────────── */}
          {isAdmin && (
            <WidgetErrorBoundary widgetName="Staff Onboarding">
              <StaffOnboardingWidget />
            </WidgetErrorBoundary>
          )}

          {/* ── Staffing Alerts ──────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Staffing Alerts">
            <StaffingAlerts />
          </WidgetErrorBoundary>

          {/* ── Info Snippets (Acknowledge New Information) ───── */}
          <WidgetErrorBoundary widgetName="Info Snippets">
            <InfoSnippets />
          </WidgetErrorBoundary>

          {/* ── Today's Operations ────────────────────────────── */}
          {data.todaysOps.length > 0 && (
            <WidgetErrorBoundary widgetName="Today's Operations">
              <TodaysOps centres={data.todaysOps} />
            </WidgetErrorBoundary>
          )}

          {/* ── Metrics Section Divider ──────────────────────── */}
          <SectionDivider label="Metrics" />

          {/* ── Key Metrics Bar ─────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Key Metrics">
            {isCoordinator ? (
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

          {/* ── Centre Health Heatmap (not for coordinator) ──── */}
          {!isCoordinator && (
            <WidgetErrorBoundary widgetName="Centre Health">
              <CentreHealthHeatmap centres={data.centreHealth} networkAvgScore={data.networkAvgScore} />
            </WidgetErrorBoundary>
          )}

          {/* ── School Relationship Health ──────────────────── */}
          {!isCoordinator && (
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
                          ? "text-success"
                          : data.npsSurvey.score !== null && data.npsSurvey.score >= 0
                          ? "text-warning"
                          : "text-danger"
                      }`}
                    >
                      {data.npsSurvey.score !== null ? data.npsSurvey.score : "N/A"}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted mt-0.5">Score</div>
                  </div>

                  <div className="flex-1 grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-success">{data.npsSurvey.promoters}</div>
                      <div className="text-[10px] sm:text-xs text-muted">Promoters</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-warning">{data.npsSurvey.passives}</div>
                      <div className="text-[10px] sm:text-xs text-muted">Passives</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base sm:text-lg font-semibold text-danger">{data.npsSurvey.detractors}</div>
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
          {!isCoordinator && (
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
                  revenue={isCoordinator ? [] : data.trends.revenue}
                  enrolments={data.trends.enrolments}
                  tickets={isCoordinator ? [] : data.trends.tickets}
                />
              </WidgetErrorBoundary>
            </div>
            <div className="lg:col-span-2">
              <WidgetErrorBoundary widgetName="Action Items">
                <ActionItemsFeed
                  overdueTodos={data.actionItems.overdueTodos}
                  unassignedTickets={isCoordinator ? [] : data.actionItems.unassignedTickets}
                  idsIssues={data.actionItems.idsIssues}
                  overdueRocks={isCoordinator ? [] : data.actionItems.overdueRocks}
                />
              </WidgetErrorBoundary>
            </div>
          </div>

          {/* ── Recent Activity ──────────────────────────────── */}
          <WidgetErrorBoundary widgetName="Recent Activity">
            <DashboardRecentActivity />
          </WidgetErrorBoundary>
        </div>
      ) : (
        <div className="text-center py-16 text-muted">
          <p>Unable to load dashboard data. Please try again.</p>
        </div>
      )}
    </div>
  );
}
