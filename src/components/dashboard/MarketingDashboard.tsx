"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import Link from "next/link";
import {
  UserPlus,
  Mail,
  TrendingUp,
  ChevronRight,
  Megaphone,
  BarChart3,
  Target,
  ArrowUpRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { MobileQuickActions } from "@/components/dashboard/MobileQuickActions";
import { InfoSnippets } from "@/components/dashboard/InfoSnippets";

interface PipelineStage {
  stage: string;
  count: number;
}

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  nurturing: "Nurturing",
  meeting_booked: "Meeting Booked",
  form_started: "Form Started",
  form_submitted: "Submitted",
  won: "Won",
  lost: "Lost",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-cyan-500",
  nurturing: "bg-purple-500",
  meeting_booked: "bg-amber-500",
  form_started: "bg-orange-500",
  form_submitted: "bg-emerald-500",
};

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

export function MarketingDashboard() {
  const { data: session } = useSession();

  const greeting = useMemo(() => getGreeting(), []);
  const todayDate = useMemo(() => formatTodayDate(), []);
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  // Fetch dashboard data for pipeline info
  const { data: dashData, isLoading: dashLoading } = useQuery<{
    opsMetrics: { pipelineLeads: number; enrolmentPipeline: PipelineStage[] } | null;
  }>({
    queryKey: ["dashboard-command-centre"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Fetch enquiry stats
  const { data: enquiryData, isLoading: enquiryLoading } = useQuery<{
    total: number;
    recentConversions: number;
  }>({
    queryKey: ["marketing-enquiry-stats"],
    queryFn: async () => {
      const res = await fetch("/api/enquiries?summary=true");
      if (!res.ok) return { total: 0, recentConversions: 0 };
      const data = await res.json();
      return {
        total: data.total ?? data.enquiries?.length ?? 0,
        recentConversions: data.recentConversions ?? data.conversions ?? 0,
      };
    },
    staleTime: 5 * 60_000,
  });

  // Fetch email analytics
  const { data: emailData, isLoading: emailLoading } = useQuery<{
    totalSent: number;
    openRate: number;
    clickRate: number;
  }>({
    queryKey: ["marketing-email-stats"],
    queryFn: async () => {
      const res = await fetch("/api/email/analytics?days=30");
      if (!res.ok) return { totalSent: 0, openRate: 0, clickRate: 0 };
      const data = await res.json();
      return {
        totalSent: data.totalSent ?? 0,
        openRate: data.openRate ?? 0,
        clickRate: data.clickRate ?? 0,
      };
    },
    staleTime: 5 * 60_000,
  });

  const isLoading = dashLoading || enquiryLoading || emailLoading;

  const pipeline = dashData?.opsMetrics?.enrolmentPipeline ?? [];
  const pipelineTotal = dashData?.opsMetrics?.pipelineLeads ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">
          {greeting}, {firstName}
        </h2>
        <p className="text-muted text-sm mt-1">{todayDate}</p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link
          href="/enquiries"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors whitespace-nowrap bg-card shadow-[var(--shadow-warm-sm)]"
        >
          <UserPlus className="w-3.5 h-3.5" />
          New Enquiry
        </Link>
        <Link
          href="/marketing/email/compose"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors whitespace-nowrap bg-card shadow-[var(--shadow-warm-sm)]"
        >
          <Mail className="w-3.5 h-3.5" />
          Send Email
        </Link>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors whitespace-nowrap bg-card shadow-[var(--shadow-warm-sm)]"
        >
          <Target className="w-3.5 h-3.5" />
          CRM Pipeline
        </Link>
        <Link
          href="/conversions"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors whitespace-nowrap bg-card shadow-[var(--shadow-warm-sm)]"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Conversions
        </Link>
      </div>

      {/* Mobile Quick Actions */}
      <MobileQuickActions role="marketing" />

      {/* Info Snippets */}
      <WidgetErrorBoundary widgetName="Info Snippets">
        <InfoSnippets />
      </WidgetErrorBoundary>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Key Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border border-border p-4 shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center gap-2 text-muted mb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-medium">Pipeline Leads</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{pipelineTotal}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center gap-2 text-muted mb-2">
                <UserPlus className="w-4 h-4" />
                <span className="text-xs font-medium">Total Enquiries</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{enquiryData?.total ?? 0}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center gap-2 text-muted mb-2">
                <Mail className="w-4 h-4" />
                <span className="text-xs font-medium">Emails (30d)</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{emailData?.totalSent ?? 0}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center gap-2 text-muted mb-2">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs font-medium">Conversions</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{enquiryData?.recentConversions ?? 0}</div>
            </div>
          </div>

          {/* Enquiry Pipeline */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-brand" />
                Enquiry Pipeline
              </h3>
              <Link
                href="/crm"
                className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
              >
                View CRM <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {pipeline.length === 0 ? (
              <div className="text-center py-6 text-muted text-sm">
                No active pipeline data available.
              </div>
            ) : (
              <div className="space-y-3">
                {pipeline.map((stage) => {
                  const pct = pipelineTotal > 0 ? (stage.count / pipelineTotal) * 100 : 0;
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground font-medium">
                          {STAGE_LABELS[stage.stage] || stage.stage}
                        </span>
                        <span className="text-muted">{stage.count}</span>
                      </div>
                      <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${STAGE_COLORS[stage.stage] || "bg-brand"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campaign Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand" />
                  Email Performance (30 days)
                </h3>
                <Link
                  href="/marketing"
                  className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
                >
                  Analytics <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-surface rounded-lg">
                  <div className="text-2xl font-bold text-foreground">{emailData?.openRate ?? 0}%</div>
                  <div className="text-xs text-muted mt-0.5">Open Rate</div>
                </div>
                <div className="text-center p-3 bg-surface rounded-lg">
                  <div className="text-2xl font-bold text-foreground">{emailData?.clickRate ?? 0}%</div>
                  <div className="text-xs text-muted mt-0.5">Click Rate</div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand" />
                  Conversion Funnel
                </h3>
                <Link
                  href="/conversions"
                  className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
                >
                  Details <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Enquiries", value: enquiryData?.total ?? 0 },
                  { label: "Active Pipeline", value: pipelineTotal },
                  { label: "Conversions", value: enquiryData?.recentConversions ?? 0 },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm text-foreground">{step.label}</span>
                      <span className="text-sm font-bold text-foreground">{step.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
