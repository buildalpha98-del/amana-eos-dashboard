"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  useQueue,
  useReviewReport,
  useCompleteTodo,
  type QueueReport,
  type QueueTodo,
} from "@/hooks/useQueue";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

const ReportViewer = dynamic(
  () =>
    import("@/components/queue/ReportViewer").then((m) => ({
      default: m.ReportViewer,
    })),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  }
);
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Inbox,
  FileText,
  CheckCircle2,
  Clock,
  Filter,
  ChevronDown,
  Eye,
  Users,
  User,
} from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { FilterPresets } from "@/components/ui/FilterPresets";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

const SEATS = [
  "marketing",
  "people",
  "operations",
  "finance",
  "programming",
  "parent-experience",
  "partnerships",
] as const;

const SEAT_COLOURS: Record<string, string> = {
  marketing: "#8B5CF6",
  mktg: "#8B5CF6",
  people: "#3B82F6",
  hr: "#3B82F6",
  operations: "#10B981",
  ops: "#10B981",
  finance: "#F59E0B",
  fin: "#F59E0B",
  programming: "#EC4899",
  prog: "#EC4899",
  "parent-experience": "#06B6D4",
  px: "#06B6D4",
  partnerships: "#6366F1",
  part: "#6366F1",
};

const SEAT_TEXT_COLOURS: Record<string, string> = {
  marketing: "#fff",
  mktg: "#fff",
  people: "#fff",
  hr: "#fff",
  operations: "#fff",
  ops: "#fff",
  finance: "#fff",
  fin: "#fff",
  programming: "#fff",
  prog: "#fff",
  "parent-experience": "#fff",
  px: "#fff",
  partnerships: "#fff",
  part: "#fff",
};

function seatLabel(seat: string) {
  return seat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SeatPill({ seat }: { seat: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: SEAT_COLOURS[seat] || "#e5e7eb",
        color: SEAT_TEXT_COLOURS[seat] || "#fff",
      }}
    >
      {seatLabel(seat)}
    </span>
  );
}

function ReportCard({
  report,
  onReview,
  onView,
  isPending,
}: {
  report: QueueReport;
  onReview: () => void;
  onView: () => void;
  isPending: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-brand/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <SeatPill seat={report.seat} />
            <span className="text-xs text-muted capitalize">
              {report.reportType.replace(/-/g, " ")}
            </span>
          </div>
          <h3 className="text-sm font-medium text-foreground truncate">
            {report.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(report.createdAt)}
            </span>
            {report.service && (
              <span className="text-xs text-muted">
                {report.service.name}
              </span>
            )}
            {report.assignedTo && (
              <span className="text-xs text-muted font-medium">
                → {report.assignedTo.name}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onView}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/80 bg-surface rounded-lg hover:bg-border transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          View Report
        </button>
        {report.status === "pending" && (
          <button
            onClick={onReview}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isPending ? "Marking..." : "Mark Reviewed"}
          </button>
        )}
      </div>
    </div>
  );
}

function TodoCard({
  todo,
  onComplete,
  isPending,
}: {
  todo: QueueTodo;
  onComplete: () => void;
  isPending: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-brand/30 transition-colors">
      <div className="flex items-start gap-3">
        <button
          onClick={onComplete}
          disabled={isPending}
          className={cn(
            "mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors",
            isPending
              ? "border-brand bg-brand/10"
              : "border-border hover:border-brand"
          )}
        >
          {isPending && <CheckCircle2 className="w-3 h-3 text-brand" />}
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground">{todo.title}</h3>
          {todo.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">
              {todo.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted capitalize">
              {todo.category.replace(/-/g, " ")}
            </span>
            <span className="text-xs text-muted">{todo.centreId}</span>
            {todo.dueTime && (
              <span className="text-xs text-muted">Due: {todo.dueTime}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const v2 = useStaffV2Flag();
  const { data: session } = useSession();
  const [seatFilter, setSeatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewingReport, setViewingReport] = useState<QueueReport | null>(null);
  const [queueView, setQueueView] = useState<"mine" | "all">("mine");

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = userRole === "owner" || userRole === "admin";

  const { data, isLoading, error, refetch } = useQueue({
    seat: seatFilter || undefined,
    status: statusFilter || undefined,
    view: queueView,
  });

  const reviewReport = useReviewReport();
  const completeTodo = useCompleteTodo();

  // Group reports by serviceCode for "All Queues" view; within each service
  // subgroup by assignee to preserve per-owner context inside the service column.
  const reportsByService = useMemo(() => {
    if (queueView !== "all") return null;
    return (data?.reports ?? []).reduce<Record<string, QueueReport[]>>(
      (acc, r) => {
        const code = r.serviceCode ?? "Unassigned";
        (acc[code] ??= []).push(r);
        return acc;
      },
      {}
    );
  }, [data?.reports, queueView]);

  function groupByAssignee(reports: QueueReport[]) {
    const groups: Record<string, QueueReport[]> = {};
    for (const report of reports) {
      const name = report.assignedTo?.name || "Unassigned";
      if (!groups[name]) groups[name] = [];
      groups[name].push(report);
    }
    return groups;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <ErrorState
          title="Failed to load queue"
          error={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  const reports = data?.reports || [];
  const todos = data?.todos || [];
  const reportCount = data?.counts.reports || 0;
  const todoCount = data?.counts.todos || 0;

  return (
    <div
      {...(v2 ? { "data-v2": "staff" } : {})}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <PageHeader
        title={queueView === "all" ? "All Queues" : "My Queue"}
        description={
          queueView === "all"
            ? "All reports and tasks across the team"
            : "Reports and tasks assigned to you from automation"
        }
        primaryAction={{
          label: showFilters ? "Hide Filters" : "Filter",
          icon: Filter,
          onClick: () => setShowFilters(!showFilters),
        }}
        {...(isAdmin
          ? {
              toggles: [
                {
                  options: [
                    { icon: Inbox, label: "My Queue", value: "mine" },
                    { icon: Users, label: "All Queues", value: "all" },
                  ],
                  value: queueView,
                  onChange: (v: string) => setQueueView(v as "mine" | "all"),
                },
              ],
            }
          : {})}
      >
        <ExportButton
          onClick={() =>
            exportToCsv(
              `amana-queue-${new Date().toISOString().slice(0, 10)}`,
              reports,
              [
                { header: "ID", accessor: (r) => r.id },
                { header: "Title", accessor: (r) => r.title },
                { header: "Seat", accessor: (r) => r.seat },
                { header: "Report Type", accessor: (r) => r.reportType },
                { header: "Status", accessor: (r) => r.status },
                { header: "Centre", accessor: (r) => r.service?.name ?? "" },
                { header: "Assigned To", accessor: (r) => r.assignedTo?.name ?? "Unassigned" },
                { header: "Created", accessor: (r) => new Date(r.createdAt).toLocaleDateString("en-AU") },
                { header: "Reviewed At", accessor: (r) => r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("en-AU") : "" },
              ],
            )
          }
          disabled={reports.length === 0}
        />
      </PageHeader>

      {/* Filters */}
      {showFilters && (
        <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Seat
            </label>
            <select
              value={seatFilter}
              onChange={(e) => setSeatFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm text-foreground/80 bg-card"
            >
              <option value="">All Seats</option>
              {SEATS.map((s) => (
                <option key={s} value={s}>
                  {seatLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm text-foreground/80 bg-card"
            >
              <option value="">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="all">All</option>
            </select>
          </div>
          {(seatFilter || statusFilter) && (
            <button
              onClick={() => {
                setSeatFilter("");
                setStatusFilter("");
              }}
              className="self-end px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Saved Filter Presets */}
      <FilterPresets
        pageKey="queue"
        currentFilters={{
          seat: seatFilter,
          status: statusFilter,
        }}
        onLoadPreset={(filters) => {
          setSeatFilter(filters.seat || "");
          setStatusFilter(filters.status || "");
          if (!showFilters && (filters.seat || filters.status)) {
            setShowFilters(true);
          }
        }}
      />

      {/* Stats bar */}
      {!isLoading && (
        <div className="flex flex-wrap gap-4">
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">{reportCount}</span>{" "}
            report{reportCount !== 1 ? "s" : ""} to review
          </span>
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">{todoCount}</span>{" "}
            task{todoCount !== 1 ? "s" : ""} to action
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : reports.length === 0 && todos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Queue is empty"
          description={
            queueView === "all"
              ? "No pending reports or tasks across the team."
              : "No pending reports or tasks assigned to you. Check back later or adjust your filters."
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Reports Section — grouped by service, then assignee, in "All Queues" view */}
          {queueView === "all" && reportsByService ? (
            Object.entries(reportsByService).map(
              ([serviceCode, serviceReports]) => {
                const assigneeGroups = groupByAssignee(serviceReports);
                return (
                  <section key={serviceCode} className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground/80 border-b border-border pb-1">
                      {serviceCode}{" "}
                      <span className="text-muted text-xs font-normal">
                        ({serviceReports.length})
                      </span>
                    </h3>
                    {Object.entries(assigneeGroups).map(
                      ([name, groupReports]) => (
                        <div key={name}>
                          <h4 className="text-sm font-semibold text-[#004E64] mb-3 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {name}{" "}
                            <span className="text-muted font-normal">
                              ({groupReports.length})
                            </span>
                          </h4>
                          <div className="grid gap-3">
                            {groupReports.map((report) => (
                              <ReportCard
                                key={report.id}
                                report={report}
                                onReview={() => reviewReport.mutate(report.id)}
                                onView={() => setViewingReport(report)}
                                isPending={reviewReport.isPending}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </section>
                );
              }
            )
          ) : (
            <>
              {/* My Queue — flat list */}
              {reports.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Reports to Review ({reportCount})
                  </h2>
                  <div className="grid gap-3">
                    {reports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onReview={() => reviewReport.mutate(report.id)}
                        onView={() => setViewingReport(report)}
                        isPending={reviewReport.isPending}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Todos Section */}
          {todos.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Tasks to Action ({todoCount})
              </h2>
              <div className="grid gap-3">
                {todos.map((todo) => (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    onComplete={() => completeTodo.mutate(todo.id)}
                    isPending={completeTodo.isPending}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Report Viewer (slide-over panel) */}
      {viewingReport && (
        <ReportViewer
          report={viewingReport}
          onClose={() => setViewingReport(null)}
          onReview={() => {
            reviewReport.mutate(viewingReport.id);
            setViewingReport(null);
          }}
          reviewPending={reviewReport.isPending}
        />
      )}
    </div>
  );
}
