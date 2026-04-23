"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  XCircle,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StickyTable } from "@/components/ui/StickyTable";
import { AiDraftReviewPanel } from "@/components/ai/AiDraftReviewPanel";
import type { AiDraftData } from "@/hooks/useAiDrafts";
import {
  useAdminAiDrafts,
  useBulkDraftAction,
  type AdminAiDraftRow,
} from "@/hooks/useAdminAiDrafts";

const STATUS_OPTIONS = [
  { value: "ready", label: "Ready for review" },
  { value: "accepted", label: "Accepted" },
  { value: "edited", label: "Edited" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All statuses" },
];

const TASK_TYPE_OPTIONS = [
  { value: "", label: "All task types" },
  { value: "communication", label: "Communication" },
  { value: "research", label: "Research" },
  { value: "document", label: "Document" },
  { value: "admin", label: "Admin" },
];

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "todo", label: "To-do" },
  { value: "marketingTask", label: "Marketing task" },
  { value: "coworkTodo", label: "Cowork to-do" },
  { value: "ticket", label: "Ticket" },
  { value: "issue", label: "Issue" },
];

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  edited: "bg-indigo-100 text-indigo-700",
  dismissed: "bg-gray-100 text-gray-600",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  communication: "bg-blue-100 text-blue-700",
  research: "bg-purple-100 text-purple-700",
  document: "bg-emerald-100 text-emerald-700",
  admin: "bg-gray-100 text-gray-700",
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SourceSummary {
  label: string;
  href?: string;
  assigneeName?: string | null;
}

function getSource(draft: AdminAiDraftRow): SourceSummary | null {
  if (draft.todo) {
    return {
      label: `To-do: ${draft.todo.title}`,
      href: `/todos?id=${draft.todo.id}`,
      assigneeName: draft.todo.assignee?.name ?? null,
    };
  }
  if (draft.marketingTask) {
    return {
      label: `Task: ${draft.marketingTask.title}`,
      href: `/marketing`,
      assigneeName: draft.marketingTask.assignee?.name ?? null,
    };
  }
  if (draft.coworkTodo) {
    return {
      label: `Cowork: ${draft.coworkTodo.title}`,
      assigneeName: draft.coworkTodo.assignedTo?.name ?? null,
    };
  }
  if (draft.ticket) {
    return {
      label: `Ticket #${draft.ticket.ticketNumber}${draft.ticket.subject ? " — " + draft.ticket.subject : ""}`,
      href: `/tickets`,
      assigneeName: draft.ticket.assignedTo?.name ?? null,
    };
  }
  if (draft.issue) {
    return {
      label: `Issue: ${draft.issue.title}`,
      href: `/issues`,
      assigneeName: draft.issue.owner?.name ?? null,
    };
  }
  return null;
}

/**
 * The AiDraftReviewPanel expects an AiDraftData shape (user-scoped view).
 * Admin rows carry assignee info instead of status/dueDate, but the panel
 * only reads `.title` / `.ticketNumber`. Build a minimal-compatible shape
 * so we can reuse the existing panel without rewriting it.
 */
function toPanelDraft(row: AdminAiDraftRow): AiDraftData {
  return {
    id: row.id,
    todoId: row.todoId,
    marketingTaskId: row.marketingTaskId,
    coworkTodoId: row.coworkTodoId,
    ticketId: row.ticketId,
    issueId: row.issueId,
    taskType: row.taskType,
    title: row.title,
    content: row.content,
    metadata: row.metadata,
    status: row.status,
    tokensUsed: row.tokensUsed,
    model: row.model,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy
      ? { id: row.reviewedBy.id, name: row.reviewedBy.name ?? "" }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    todo: row.todo
      ? { id: row.todo.id, title: row.todo.title, status: "", dueDate: "" }
      : null,
    marketingTask: row.marketingTask
      ? {
          id: row.marketingTask.id,
          title: row.marketingTask.title,
          status: "",
          dueDate: null,
        }
      : null,
    coworkTodo: row.coworkTodo
      ? {
          id: row.coworkTodo.id,
          title: row.coworkTodo.title,
          completed: false,
          date: "",
        }
      : null,
    ticket: row.ticket
      ? {
          id: row.ticket.id,
          ticketNumber: row.ticket.ticketNumber,
          subject: row.ticket.subject,
          status: "",
        }
      : null,
    issue: row.issue
      ? {
          id: row.issue.id,
          title: row.issue.title,
          status: "",
          priority: "",
        }
      : null,
  };
}

export function AiDraftsInboxContent() {
  const [status, setStatus] = useState("ready");
  const [taskType, setTaskType] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDraft, setSelectedDraft] = useState<AdminAiDraftRow | null>(
    null,
  );
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useAdminAiDrafts({
    status,
    taskType: taskType || undefined,
    sourceType: sourceType || undefined,
    page,
  });

  const bulkAction = useBulkDraftAction();

  const drafts = data?.drafts ?? [];

  const visibleIds = useMemo(() => drafts.map((d) => d.id), [drafts]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const handleFilterChange = (
    key: "status" | "taskType" | "sourceType",
    v: string,
  ) => {
    if (key === "status") setStatus(v);
    else if (key === "taskType") setTaskType(v);
    else setSourceType(v);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulk = (action: "approve" | "dismiss") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const verb = action === "approve" ? "Approve" : "Dismiss";
    if (!window.confirm(`${verb} ${ids.length} draft${ids.length === 1 ? "" : "s"}?`)) return;

    bulkAction.mutate(
      { action, ids },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Drafts"
        description="Review all AI-generated task drafts across the organisation"
        secondaryActions={[
          { label: "Filters", icon: Filter, onClick: () => setShowFilters((v) => !v) },
        ]}
      />

      {showFilters && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Task type
              </label>
              <select
                value={taskType}
                onChange={(e) => handleFilterChange("taskType", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {TASK_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Source
              </label>
              <select
                value={sourceType}
                onChange={(e) => handleFilterChange("sourceType", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load AI drafts. You may not have permission to view this page.
        </div>
      )}

      {/* Bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-20 bg-card rounded-xl border border-border p-3 shadow-[var(--shadow-warm)] flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-foreground/80">
            <span className="font-semibold">{selectedIds.size}</span> draft
            {selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulk("approve")}
              disabled={bulkAction.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {bulkAction.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Approve selected ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBulk("dismiss")}
              disabled={bulkAction.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface/80 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Dismiss selected ({selectedIds.size})
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkAction.isPending}
              className="text-sm font-medium text-muted hover:text-foreground transition-colors px-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <StickyTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-border"
                    disabled={visibleIds.length === 0}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">
                  Created
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">
                  Task type
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted">Title</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Source</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">
                  Assignee
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">
                  Reviewer
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && drafts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4">
                    <EmptyState
                      icon={Bot}
                      title="No AI drafts to review"
                      description="When the hourly AI task agent generates drafts, they'll land here for triage."
                      variant="inline"
                    />
                  </td>
                </tr>
              )}

              {!isLoading &&
                drafts.map((d) => {
                  const source = getSource(d);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDraft(d)}
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                    >
                      <td
                        className="px-4 py-3 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select draft ${d.title}`}
                          checked={selectedIds.has(d.id)}
                          onChange={() => toggleRow(d.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(d.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${TASK_TYPE_COLORS[d.taskType] ?? TASK_TYPE_COLORS.admin}`}
                        >
                          {d.taskType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[260px] truncate">
                        {d.title}
                      </td>
                      <td className="px-4 py-3 text-muted max-w-[260px] truncate">
                        {source?.label ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground/80">
                        {source?.assigneeName ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {d.reviewedBy?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status] ?? ""}`}
                        >
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </StickyTable>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-surface/30">
            <p className="text-sm text-muted">
              Page <span className="font-medium">{data.page}</span> of{" "}
              <span className="font-medium">{data.totalPages}</span> · {data.total}{" "}
              total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages, p + 1))
                }
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedDraft && (
        <AiDraftReviewPanel
          key={selectedDraft.id}
          draft={toPanelDraft(selectedDraft)}
          onClose={() => setSelectedDraft(null)}
        />
      )}
    </div>
  );
}
