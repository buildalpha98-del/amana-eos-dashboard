"use client";

/**
 * Workforce overview — the "Workforce" tab of /workforce-reports
 * (Staff Portal v2 Phase 10, Task 10.1).
 *
 * Headcount by role / service / employment type, starters & leavers
 * (trailing 12 months), tenure distribution, essential-training
 * completion and cert-expiry outlook — all from ONE summary API call
 * (`/api/workforce-reports/summary`). Each section has its own CSV
 * export via the shared accessor-based csv-export utility.
 *
 * Honesty: starters + tenure are based on recorded start dates with an
 * account-creation fallback — the API reports the split and the UI
 * labels it rather than pretending every date is an employment start.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  GraduationCap,
  ShieldAlert,
  UserMinus,
  Download,
} from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";
import { exportToCsv } from "@/lib/csv-export";
import { Button } from "@/components/ui/Button";
import { WorkforceBarChart } from "@/components/charts/WorkforceBarChart";
import { StartersLeaversChart } from "@/components/charts/StartersLeaversChart";
import { CHART_COLORS } from "@/components/charts/chart-colors";

interface LabelledCount {
  key: string;
  label: string;
  count: number;
}

interface MonthCount {
  month: string;
  count: number;
}

interface WorkforceSummary {
  activeStaff: number;
  headcountByRole: LabelledCount[];
  headcountByService: LabelledCount[];
  headcountByEmploymentType: LabelledCount[];
  months: string[];
  startersByMonth: MonthCount[];
  leaversByMonth: MonthCount[];
  startBasis: { withStartDate: number; usingCreatedAt: number };
  tenure: LabelledCount[];
  training: {
    totalEssential: number;
    completedEssential: number;
    completionPct: number | null;
  };
  certOutlook: {
    expired: number;
    within30: number;
    within60: number;
    within90: number;
  };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2025-10" → "Oct 25" */
function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = MONTH_NAMES[(month ?? 1) - 1] ?? key;
  return `${name} ${String(year).slice(2)}`;
}

export function WorkforceOverviewContent() {
  const { data, isLoading, error } = useQuery<WorkforceSummary, ApiResponseError>({
    queryKey: ["workforce-summary"],
    queryFn: () => fetchApi("/api/workforce-reports/summary"),
    retry: 2,
    staleTime: 300_000, // 5 min — aggregate report data moves slowly
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-border/40 rounded-xl" />
          ))}
        </div>
        <div className="h-72 bg-border/40 rounded-xl" />
        <div className="h-72 bg-border/40 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-red-600">
        Unable to load the workforce summary. Please try again.
      </p>
    );
  }

  if (data.activeStaff === 0) {
    return (
      <p className="text-sm text-muted italic">
        No active staff accounts yet — the workforce report will populate as
        staff are added.
      </p>
    );
  }

  const leavers12mo = data.leaversByMonth.reduce((sum, m) => sum + m.count, 0);
  const startersLeaversData = data.months.map((m, i) => ({
    month: monthLabel(m),
    starters: data.startersByMonth[i]?.count ?? 0,
    leavers: data.leaversByMonth[i]?.count ?? 0,
  }));

  const startBasisNote =
    data.startBasis.usingCreatedAt > 0
      ? `Based on recorded start dates; account-creation date used for ${data.startBasis.usingCreatedAt} of ${data.activeStaff} staff with no start date recorded.`
      : "Based on recorded start dates.";

  const exportHeadcounts = () => {
    const rows = [
      ...data.headcountByRole.map((r) => ({ dimension: "Role", ...r })),
      ...data.headcountByService.map((r) => ({ dimension: "Service", ...r })),
      ...data.headcountByEmploymentType.map((r) => ({
        dimension: "Employment type",
        ...r,
      })),
    ];
    exportToCsv("workforce-headcount", rows, [
      { header: "Dimension", accessor: (r) => r.dimension },
      { header: "Category", accessor: (r) => r.label },
      { header: "Active staff", accessor: (r) => r.count },
    ]);
  };

  const exportStartersLeavers = () => {
    exportToCsv(
      "workforce-starters-leavers",
      data.months.map((m, i) => ({
        month: m,
        starters: data.startersByMonth[i]?.count ?? 0,
        leavers: data.leaversByMonth[i]?.count ?? 0,
      })),
      [
        { header: "Month", accessor: (r) => r.month },
        { header: "Starters", accessor: (r) => r.starters },
        { header: "Leavers", accessor: (r) => r.leavers },
      ],
    );
  };

  const exportTenure = () => {
    exportToCsv("workforce-tenure", data.tenure, [
      { header: "Tenure", accessor: (r) => r.label },
      { header: "Active staff", accessor: (r) => r.count },
    ]);
  };

  const exportTraining = () => {
    exportToCsv(
      "workforce-training",
      [
        {
          metric: "Essential-track enrollments",
          value: data.training.totalEssential,
        },
        { metric: "Completed", value: data.training.completedEssential },
        {
          metric: "Completion %",
          value:
            data.training.completionPct === null
              ? "n/a"
              : `${data.training.completionPct}%`,
        },
      ],
      [
        { header: "Metric", accessor: (r) => r.metric },
        { header: "Value", accessor: (r) => r.value },
      ],
    );
  };

  const exportCertOutlook = () => {
    exportToCsv(
      "workforce-cert-outlook",
      [
        { window: "Expired", count: data.certOutlook.expired },
        { window: "Expiring within 30 days", count: data.certOutlook.within30 },
        { window: "Expiring in 31-60 days", count: data.certOutlook.within60 },
        { window: "Expiring in 61-90 days", count: data.certOutlook.within90 },
      ],
      [
        { header: "Window", accessor: (r) => r.window },
        { header: "Certificates", accessor: (r) => r.count },
      ],
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat
          label="Active staff"
          value={String(data.activeStaff)}
          icon={UsersIcon}
        />
        <Stat
          label="Essential training"
          value={
            data.training.completionPct === null
              ? "—"
              : `${data.training.completionPct}%`
          }
          sub={
            data.training.totalEssential > 0
              ? `${data.training.completedEssential} of ${data.training.totalEssential} enrollments complete`
              : "No essential enrollments"
          }
          icon={GraduationCap}
        />
        <Stat
          label="Certs due ≤ 30 days"
          value={String(data.certOutlook.within30)}
          sub={
            data.certOutlook.expired > 0
              ? `${data.certOutlook.expired} already expired`
              : undefined
          }
          icon={ShieldAlert}
        />
        <Stat
          label="Leavers (12 mo)"
          value={String(leavers12mo)}
          icon={UserMinus}
        />
      </div>

      {/* ── Headcount ──────────────────────────────────────── */}
      <Section
        title="Headcount"
        subtitle="Active staff accounts by role, service and employment type"
        onExport={exportHeadcounts}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">By role</h4>
            <WorkforceBarChart data={data.headcountByRole} horizontal />
          </div>
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">
              By service
            </h4>
            <WorkforceBarChart
              data={data.headcountByService}
              horizontal
              color={CHART_COLORS.light}
            />
          </div>
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-foreground mb-2">
            By employment type
          </h4>
          <WorkforceBarChart
            data={data.headcountByEmploymentType}
            color={CHART_COLORS.info}
            height={220}
          />
          {data.headcountByEmploymentType.some((t) => t.key === "unspecified") && (
            <p className="text-xs text-muted mt-1">
              &ldquo;Not recorded&rdquo; = staff profiles without an employment
              type set.
            </p>
          )}
        </div>
      </Section>

      {/* ── Starters & leavers ─────────────────────────────── */}
      <Section
        title="Starters & leavers"
        subtitle="Trailing 12 months"
        onExport={exportStartersLeavers}
      >
        <StartersLeaversChart data={startersLeaversData} />
        <p className="text-xs text-muted mt-2">
          Starters: {startBasisNote} Leavers: separation records by last working
          day.
        </p>
      </Section>

      {/* ── Tenure ─────────────────────────────────────────── */}
      <Section
        title="Tenure distribution"
        subtitle="Active staff by time since start"
        onExport={exportTenure}
      >
        <WorkforceBarChart
          data={data.tenure}
          color={CHART_COLORS.success}
          height={240}
        />
        <p className="text-xs text-muted mt-2">{startBasisNote}</p>
      </Section>

      {/* ── Training ───────────────────────────────────────── */}
      <Section
        title="Essential training"
        subtitle="Published essential-track course enrollments for active staff"
        onExport={exportTraining}
      >
        {data.training.totalEssential === 0 ? (
          <p className="text-sm text-muted italic">
            No enrollments in published essential-track courses yet.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {data.training.completionPct}%
              </span>
              <span className="text-sm text-muted">
                complete — {data.training.completedEssential} of{" "}
                {data.training.totalEssential} enrollments
              </span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-surface overflow-hidden"
              role="progressbar"
              aria-valuenow={data.training.completionPct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Essential training completion"
            >
              <div
                className="h-full bg-brand rounded-full"
                style={{ width: `${data.training.completionPct ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </Section>

      {/* ── Cert-expiry outlook ────────────────────────────── */}
      <Section
        title="Certificate expiry outlook"
        subtitle="Current (non-superseded) certificates held by active staff"
        onExport={exportCertOutlook}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <OutlookCard
            label="Expired"
            count={data.certOutlook.expired}
            tone="danger"
          />
          <OutlookCard
            label="Within 30 days"
            count={data.certOutlook.within30}
            tone="warning"
          />
          <OutlookCard label="31–60 days" count={data.certOutlook.within60} />
          <OutlookCard label="61–90 days" count={data.certOutlook.within90} />
        </div>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted" />
        <p className="text-xs uppercase font-semibold text-muted tracking-wider">
          {label}
        </p>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  onExport,
  children,
}: {
  title: string;
  subtitle?: string;
  onExport: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={onExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>
      {children}
    </div>
  );
}

function OutlookCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone?: "danger" | "warning";
}) {
  const valueClass =
    count === 0
      ? "text-foreground"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs uppercase font-semibold text-muted tracking-wider">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${valueClass}`}>
        {count}
      </p>
    </div>
  );
}
