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
import { cn } from "@/lib/utils";

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
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <SeatPill seat={report.seat} />
            <span className="text-xs text-gray-400 capitalize">
              {report.reportType.replace(/-/g, " ")}
            </span>
          </div>
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {report.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(report.createdAt)}
            </span>
            {report.service && (
              <span className="text-xs text-gray-500">
                {report.service.name}
              </span>
            )}
            {report.assignedTo && (
              <span className="text-xs text-gray-500 font-medium">
                → {report.assignedTo.name}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onView}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 transition-colors">
      <div className="flex items-start gap-3">
        <button
          onClick={onComplete}
          disabled={isPending}
          className={cn(
            "mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors",
            isPending
              ? "border-brand bg-brand/10"
              : "border-gray-300 hover:border-brand"
          )}
        >
          {isPending && <CheckCircle2 className="w-3 h-3 text-brand" />}
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900">{todo.title}</h3>
          {todo.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {todo.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 capitalize">
              {todo.category.replace(/-/g, " ")}
            </span>
            <span className="text-xs text-gray-400">{todo.centreId}</span>
            {todo.dueTime && (
              <span className="text-xs text-gray-500">Due: {todo.dueTime}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
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

  // Group reports by assignee for "All Queues" view
  const groupedReports = useMemo(() => {
    if (queueView !== "all") return null;
    const reports = data?.reports || [];
    const groups: Record<string, QueueReport[]> = {};
    for (const report of reports) {
      const name = report.assignedTo?.name || "Unassigned";
      if (!groups[name]) groups[name] = [];
      groups[name].push(report);
    }
    return groups;
  }, [queueView, data?.reports]);

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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {queueView === "all" ? (
              <Users className="w-5 h-5 text-brand" />
            ) : (
              <Inbox className="w-5 h-5 text-brand" />
            )}
            {queueView === "all" ? "All Queues" : "My Queue"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {queueView === "all"
              ? "All reports and tasks across the team"
              : "Reports and tasks assigned to you from automation"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setQueueView("mine")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  queueView === "mine"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Inbox className="w-3.5 h-3.5" />
                My Queue
              </button>
              <button
                onClick={() => setQueueView("all")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  queueView === "all"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                All Queues
              </button>
            </div>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
              showFilters
                ? "bg-brand/5 border-brand/20 text-brand"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            )}
          >
            <Filter className="w-4 h-4" />
            Filter
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform",
                showFilters && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Seat
            </label>
            <select
              value={seatFilter}
              onChange={(e) => setSeatFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
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
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
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
              className="self-end px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Stats bar */}
      {!isLoading && (
        <div className="flex flex-wrap gap-4">
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{reportCount}</span>{" "}
            report{reportCount !== 1 ? "s" : ""} to review
          </span>
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{todoCount}</span>{" "}
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
          {/* Reports Section — grouped by assignee in "All Queues" view */}
          {queueView === "all" && groupedReports ? (
            Object.entries(groupedReports).map(([name, groupReports]) => (
              <section key={name}>
                <h2 className="text-sm font-semibold text-[#004E64] mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {name}{" "}
                  <span className="text-gray-400 font-normal">
                    ({groupReports.length})
                  </span>
                </h2>
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
              </section>
            ))
          ) : (
            <>
              {/* My Queue — flat list */}
              {reports.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
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
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
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
