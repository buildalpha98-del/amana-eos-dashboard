"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import {
  useCockpitSummary,
  useCurrentWeeklyReport,
  useReviewWeeklyReport,
  useSendWeeklyReport,
  useUpdatePriorities,
  type WeeklyReportDetail,
} from "@/hooks/useCockpit";
import type { CockpitSummary } from "@/lib/cockpit/summary";
import { nextTermWithin } from "@/lib/vendor-brief/term-dates";
import type { RagStatus } from "@/lib/rag-status";
import { Skeleton } from "@/components/ui/Skeleton";

/* ============================================================
 * RAG visuals
 * ==========================================================*/

const RAG_DOT_CLASSES: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const RAG_TEXT_CLASSES: Record<RagStatus, string> = {
  green: "text-green-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

function RagDot({ status }: { status: RagStatus }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${RAG_DOT_CLASSES[status]}`}
      aria-label={`${status} status`}
    />
  );
}

function MetricRow({
  label,
  current,
  target,
  status,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  status: RagStatus;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted">
        <RagDot status={status} />
        <span>{label}</span>
      </div>
      <div className={`font-semibold ${RAG_TEXT_CLASSES[status]}`}>
        {unit === "pct" ? `${Math.round(current * 100)}%` : current}
        <span className="text-muted font-normal"> / {unit === "pct" ? `${Math.round(target * 100)}%` : target}</span>
      </div>
    </div>
  );
}

/* ============================================================
 * Weekly Report Banner
 * ==========================================================*/

function WeeklyReportBanner({
  summary,
  report,
}: {
  summary: CockpitSummary;
  report: WeeklyReportDetail | null;
}) {
  const [open, setOpen] = useState(false);

  if (!summary.weeklyReport.id || !report) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          No draft report yet for this week — the cron will run Sunday evening.
        </div>
      </div>
    );
  }

  const status = summary.weeklyReport.status;
  const readyToSend = summary.weeklyReport.readyToSend;

  const bgClass =
    status === "sent"
      ? "bg-green-50 border-green-200"
      : status === "reviewed"
        ? readyToSend
          ? "bg-amber-50 border-amber-200"
          : "bg-sky-50 border-sky-200"
        : "bg-card border-border";

  return (
    <>
      <div className={`rounded-xl border p-4 ${bgClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-foreground" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Weekly Report —{" "}
                {status === "sent"
                  ? "Sent"
                  : status === "reviewed"
                    ? readyToSend
                      ? "Ready to send"
                      : "Reviewed"
                    : "Draft"}
              </div>
              <div className="text-xs text-muted mt-0.5">
                Week of{" "}
                {new Date(summary.weekStart).toLocaleDateString("en-AU", {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface"
            >
              {status === "sent" ? "View" : "Review & edit"}
            </button>
          </div>
        </div>
      </div>
      {open && <ReportReviewDialog report={report} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ============================================================
 * Report Review Dialog
 * ==========================================================*/

function ReportReviewDialog({
  report,
  onClose,
}: {
  report: WeeklyReportDetail;
  onClose: () => void;
}) {
  const [wins, setWins] = useState(report.wins ?? "");
  const [blockers, setBlockers] = useState(report.blockers ?? "");
  const [nextWeekTop3, setNextWeekTop3] = useState(report.nextWeekTop3 ?? "");
  const [draftBody, setDraftBody] = useState(report.draftBody ?? "");

  const review = useReviewWeeklyReport(report.id);
  const send = useSendWeeklyReport(report.id);

  const isSent = report.status === "sent";
  const isReviewed = report.status === "reviewed" || review.isSuccess;

  async function handleSaveReview() {
    await review.mutateAsync({ wins, blockers, nextWeekTop3, draftBody });
  }

  async function handleSend() {
    await send.mutateAsync();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl rounded-t-xl sm:rounded-xl bg-card shadow-lg max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="font-semibold text-foreground">Weekly Marketing Report</div>
            <div className="text-xs text-muted">
              Week of{" "}
              {new Date(report.weekStart).toLocaleDateString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-surface"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Wins">
            <textarea
              value={wins}
              onChange={(e) => setWins(e.target.value)}
              disabled={isSent}
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
              placeholder="Key wins from this week..."
            />
          </Field>
          <Field label="Blockers">
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              disabled={isSent}
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
              placeholder="Blockers or risks..."
            />
          </Field>
          <Field label="Next Week's Top 3">
            <textarea
              value={nextWeekTop3}
              onChange={(e) => setNextWeekTop3(e.target.value)}
              disabled={isSent}
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
              placeholder="1. ..."
            />
          </Field>
          <Field label="Narrative (markdown)">
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={isSent}
              rows={10}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono disabled:opacity-60"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div className="text-xs text-muted">
            Status:{" "}
            <span className="font-medium text-foreground">{report.status}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isSent && (
              <button
                onClick={handleSaveReview}
                disabled={review.isPending}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
              >
                {review.isPending ? "Saving..." : "Save review"}
              </button>
            )}
            {isReviewed && !isSent && (
              <button
                onClick={handleSend}
                disabled={send.isPending}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {send.isPending ? "Sending..." : "Send to leadership"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

/* ============================================================
 * Priorities Strip
 * ==========================================================*/

function PrioritiesStrip({ summary }: { summary: CockpitSummary }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(summary.priorities.join("\n"));
  const update = useUpdatePriorities();

  async function handleSave() {
    await update.mutateAsync(value.trim() || null);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">This week&apos;s Top 3</div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-muted hover:text-foreground flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            placeholder="One priority per line (max 3)"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {update.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : summary.priorities.length === 0 ? (
        <div className="mt-2 text-sm text-muted">No priorities set yet this week.</div>
      ) : (
        <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-foreground">
          {summary.priorities.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ============================================================
 * Scorecard Tiles
 * ==========================================================*/

function TileCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted" />
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function BrandSocialTile({ data }: { data: CockpitSummary["tiles"]["brandSocial"] }) {
  return (
    <TileCard title="Brand & Social" icon={Sparkles}>
      <MetricRow label="Feed posts" {...data.feed} />
      <MetricRow label="Stories" {...data.stories} />
      <MetricRow label="Reels" {...data.reels} />
      <MetricRow label="CTA compliance" {...data.ctaCompliance} unit="pct" />
    </TileCard>
  );
}

function ContentTeamTile({ data }: { data: CockpitSummary["tiles"]["contentTeam"] }) {
  return (
    <TileCard title="Content Team" icon={Users}>
      <MetricRow label="Team hires" {...data.hires} />
      <MetricRow label="Briefs approved <24h" {...data.briefs24h} unit="pct" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Claude drafts this week</span>
        <span className={data.claudeThisWeek ? "text-green-600 font-semibold" : "text-amber-600"}>
          {data.claudeThisWeek ? "Yes" : "None"}
        </span>
      </div>
    </TileCard>
  );
}

function SchoolLiaisonTile({ data }: { data: CockpitSummary["tiles"]["schoolLiaison"] }) {
  return (
    <TileCard title="School Liaison" icon={FileText}>
      <MetricRow label="Term placements" {...data.termPlacements} />
      <div className="mt-2 grid grid-cols-5 gap-1">
        {data.perCentre.map((c) => (
          <div
            key={c.serviceId}
            title={`${c.serviceName}: ${c.count}`}
            className={`h-6 rounded ${RAG_DOT_CLASSES[c.status]}/20 border border-border flex items-center justify-center text-[10px] font-medium`}
          >
            {c.count}
          </div>
        ))}
      </div>
    </TileCard>
  );
}

function ActivationsTile({ data }: { data: CockpitSummary["tiles"]["activations"] }) {
  return (
    <TileCard title="Activations" icon={TrendingUp}>
      <MetricRow label="Term activations" {...data.termActivations} />
      {data.recapRate && (
        <MetricRow label="Recap rate" {...data.recapRate} unit="pct" />
      )}
    </TileCard>
  );
}

function WhatsAppTile({ data }: { data: CockpitSummary["tiles"]["whatsapp"] }) {
  return (
    <TileCard title="WhatsApp" icon={MessageCircle}>
      <MetricRow label="Coordinator posts (7d)" {...data.coordinator} />
      <MetricRow label="Engagement" {...data.engagement} />
      <MetricRow label="Announcements" {...data.announcements} />
    </TileCard>
  );
}

function CentreIntelTile({ data }: { data: CockpitSummary["tiles"]["centreIntel"] }) {
  return (
    <TileCard title="Centre Intelligence" icon={Users}>
      <MetricRow label="Fresh avatars (<30d)" {...data.fresh} />
      {data.stale.length > 0 && (
        <div className="pt-1 text-xs text-muted">
          {data.stale.length} stale ({data.stale[0].serviceName} {data.stale[0].daysStale}d)
        </div>
      )}
      {data.pendingInsightsCount > 0 && (
        <Link
          href="/centre-avatars"
          className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
        >
          <Sparkles className="h-3 w-3" />
          {data.pendingInsightsCount} insight{data.pendingInsightsCount === 1 ? "" : "s"} to review →
        </Link>
      )}
    </TileCard>
  );
}

/* ============================================================
 * Secondary row
 * ==========================================================*/

function AiDraftsCard({ data }: { data: CockpitSummary["aiDrafts"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-muted" />
        AI Drafts
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold text-foreground">{data.total}</div>
        <div className="text-xs text-muted">pending review</div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
        <div>Posts: <span className="text-foreground font-medium">{data.breakdown.posts}</span></div>
        <div>Campaigns: <span className="text-foreground font-medium">{data.breakdown.campaigns}</span></div>
        <div>Other: <span className="text-foreground font-medium">{data.breakdown.other}</span></div>
      </div>
      {data.total > 0 && (
        <Link
          href="/queue"
          className="mt-3 inline-block text-xs text-brand hover:underline"
        >
          Review in queue →
        </Link>
      )}
    </div>
  );
}

function VendorTile({ data }: { data: CockpitSummary["vendorBriefs"] }) {
  // Sprint 4: drill-down links into /marketing/vendor-briefs.
  // Counts → in-flight tab. SLA watch entry → in-flight tab + open detail.
  // Missing-next-term → term-readiness tab with the next term selected.
  const nextTerm = nextTermWithin(12);
  const termReadinessHref = nextTerm
    ? `/marketing/vendor-briefs?tab=term-readiness&termYear=${nextTerm.year}&termNumber=${nextTerm.term}`
    : "/marketing/vendor-briefs?tab=term-readiness";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileText className="h-4 w-4 text-muted" />
        Vendor Briefs
      </div>
      <div className="mt-2 flex items-baseline gap-4 text-sm">
        <Link
          href="/marketing/vendor-briefs?tab=in-flight"
          className="rounded hover:underline"
        >
          <span className="text-foreground font-semibold">{data.inFlight}</span>{" "}
          <span className="text-muted">in flight</span>
        </Link>
        <Link href={termReadinessHref} className="rounded hover:underline">
          <span className="text-foreground font-semibold">{data.missingForNextTerm}</span>{" "}
          <span className="text-muted">missing next term</span>
        </Link>
      </div>
      {data.slaWatch.length > 0 && (
        <div className="mt-2 space-y-1">
          {data.slaWatch.map((s) => (
            <Link
              key={s.id}
              href={`/marketing/vendor-briefs?tab=in-flight&open=${s.id}`}
              className="flex items-center gap-1 rounded text-xs text-amber-700 hover:bg-amber-50"
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="truncate">{s.title}</span>
              <span className="text-muted">— {s.daysOverdue}d overdue</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EscalationsStrip({ escalations }: { escalations: CockpitSummary["escalations"] }) {
  if (escalations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        No escalations this week — all clear.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        Escalations ({escalations.length})
      </div>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">
        {escalations.slice(0, 5).map((e, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-amber-500">•</span>
            <span>{e.context}</span>
          </li>
        ))}
        {escalations.length > 5 && (
          <li className="text-xs text-muted">...and {escalations.length - 5} more</li>
        )}
      </ul>
    </div>
  );
}

/* ============================================================
 * Main component
 * ==========================================================*/

export function MarketingCockpit() {
  const summaryQuery = useCockpitSummary();
  const reportQuery = useCurrentWeeklyReport();

  if (summaryQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (summaryQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Failed to load cockpit
        </div>
        <div className="mt-1">{(summaryQuery.error as Error)?.message ?? "Unknown error"}</div>
        <button
          onClick={() => summaryQuery.refetch()}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = summaryQuery.data!;
  const report = reportQuery.data?.report ?? null;

  return (
    <div className="space-y-4">
      <WeeklyReportBanner summary={summary} report={report} />
      <PrioritiesStrip summary={summary} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <BrandSocialTile data={summary.tiles.brandSocial} />
        <ContentTeamTile data={summary.tiles.contentTeam} />
        <SchoolLiaisonTile data={summary.tiles.schoolLiaison} />
        <ActivationsTile data={summary.tiles.activations} />
        <WhatsAppTile data={summary.tiles.whatsapp} />
        <CentreIntelTile data={summary.tiles.centreIntel} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AiDraftsCard data={summary.aiDrafts} />
        <VendorTile data={summary.vendorBriefs} />
      </div>

      <EscalationsStrip escalations={summary.escalations} />

      {reportQuery.isFetching && (
        <div className="flex items-center gap-2 text-xs text-muted justify-center">
          <Loader2 className="h-3 w-3 animate-spin" /> refreshing...
        </div>
      )}
    </div>
  );
}
