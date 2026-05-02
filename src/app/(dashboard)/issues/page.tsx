"use client";

import { useState, useMemo, useCallback } from "react";
import { useIssues, useBulkIssueAction } from "@/hooks/useIssues";
import { useQuery } from "@tanstack/react-query";
import { IssueCard, type IssueCardOpenOpts } from "@/components/issues/IssueCard";
import { IssueKanban } from "@/components/issues/IssueKanban";
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  AlertCircle,
  Plus,
  Filter,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  List,
  Archive,
  Download,
  X,
  Trash2,
  UserPlus,
  ArrowRightCircle,
} from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterPresets } from "@/components/ui/FilterPresets";
import { PageHeader } from "@/components/layout/PageHeader";

interface UserOption {
  id: string;
  name: string;
}

const statusTabs = [
  { key: "", label: "All", icon: null },
  { key: "open", label: "Identify", icon: AlertTriangle, color: "text-amber-600" },
  { key: "in_discussion", label: "Discuss", icon: MessageSquare, color: "text-blue-600" },
  { key: "solved", label: "Solved", icon: CheckCircle2, color: "text-emerald-600" },
  { key: "closed", label: "Closed", icon: XCircle, color: "text-muted" },
] as const;

export default function IssuesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailFocus, setDetailFocus] = useState<IssueCardOpenOpts["focus"] | undefined>(undefined);

  const openDetail = useCallback((id: string, opts?: IssueCardOpenOpts) => {
    setSelectedId(id);
    setDetailFocus(opts?.focus);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetailFocus(undefined);
  }, []);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [showArchived, setShowArchived] = useState(false);
  const [aiPrioritization, setAiPrioritization] = useState("");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  const { data: issues, isLoading, error, refetch } = useIssues({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
    ...(ownerFilter ? { ownerId: ownerFilter } : {}),
  });

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const bulkAction = useBulkIssueAction();

  // Filter out closed issues when archive is hidden
  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    if (showArchived) return issues;
    return issues.filter((i) => i.status !== "closed");
  }, [issues, showArchived]);

  // Group issues by status for board view
  const boardColumns = useMemo(() => {
    if (!filteredIssues) return { open: [], in_discussion: [], solved: [], closed: [] };
    return {
      open: filteredIssues.filter((i) => i.status === "open"),
      in_discussion: filteredIssues.filter((i) => i.status === "in_discussion"),
      solved: filteredIssues.filter((i) => i.status === "solved"),
      closed: filteredIssues.filter((i) => i.status === "closed"),
    };
  }, [filteredIssues]);

  // Stats
  const stats = useMemo(() => {
    if (!issues) return { total: 0, open: 0, discussing: 0, solved: 0, critical: 0 };
    return {
      total: issues.length,
      open: issues.filter((i) => i.status === "open").length,
      discussing: issues.filter((i) => i.status === "in_discussion").length,
      solved: issues.filter((i) => i.status === "solved").length,
      critical: issues.filter((i) => i.priority === "critical" && i.status !== "closed").length,
    };
  }, [issues]);

  // Build issue list string for AI prioritization
  const openIssues = useMemo(() => {
    if (!issues) return [];
    return issues.filter((i) => i.status === "open" || i.status === "in_discussion");
  }, [issues]);

  const issueListForAi = useMemo(() => {
    if (!openIssues.length) return "";
    return openIssues
      .map((i, idx) => {
        const age = Math.floor(
          (Date.now() - new Date(i.identifiedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        return `${idx + 1}. "${i.title}" — Priority: ${i.priority}, Status: ${i.status}, Centre: ${i.service?.name ?? "Company-wide"}, Owner: ${i.owner?.name ?? "Unassigned"}, Age: ${age} days${i.description ? `, Details: ${i.description.slice(0, 200)}` : ""}`;
      })
      .join("\n");
  }, [openIssues]);

  const hasActiveFilters = priorityFilter || ownerFilter;

  // Bulk selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredIssues.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIssues.map((i) => i.id)));
    }
  }, [filteredIssues, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setShowAssignDropdown(false);
  }, []);

  const handleBulkResolve = () => {
    bulkAction.mutate(
      { action: "resolve", ids: Array.from(selectedIds) },
      { onSuccess: clearSelection }
    );
  };

  const handleBulkDelete = () => {
    bulkAction.mutate(
      { action: "delete", ids: Array.from(selectedIds) },
      {
        onSuccess: () => {
          clearSelection();
          setShowDeleteConfirm(false);
        },
      }
    );
  };

  const handleBulkAssign = (assigneeId: string) => {
    bulkAction.mutate(
      { action: "assign", ids: Array.from(selectedIds), assigneeId },
      {
        onSuccess: () => {
          clearSelection();
          setShowAssignDropdown(false);
        },
      }
    );
  };

  const handleBulkMove = (category: string) => {
    bulkAction.mutate(
      { action: "move", ids: Array.from(selectedIds), category },
      { onSuccess: clearSelection }
    );
  };

  const isAllSelected = filteredIssues.length > 0 && selectedIds.size === filteredIssues.length;
  const hasBulkSelection = selectedIds.size > 0;

  // Suppress unused variable warnings for boardColumns (used implicitly by board view)
  void boardColumns;

  return (
    <div
      data-v2="staff"
      className="max-w-7xl mx-auto"
    >
      {/* Header */}
      <PageHeader
        title="Issues"
        description="Track and resolve using IDS (Identify, Discuss, Solve)"
        helpTooltipId="issues-heading"
        helpTooltipContent="The Issues List captures problems, ideas, and opportunities. Use IDS (Identify, Discuss, Solve) in your L10 meeting to work through them."
        primaryAction={{ label: "Raise Issue", icon: Plus, onClick: () => setShowCreate(true) }}
        toggles={[{
          options: [
            { icon: LayoutGrid, label: "Board view", value: "board" },
            { icon: List, label: "List view", value: "list" },
          ],
          value: viewMode,
          onChange: (v) => setViewMode(v as "board" | "list"),
        }]}
        secondaryActions={[
          {
            label: showArchived ? "Hide Closed" : "Show Closed",
            icon: Archive,
            onClick: () => setShowArchived(!showArchived),
            active: showArchived,
          },
          {
            label: "Filters",
            icon: Filter,
            onClick: () => setShowFilters(!showFilters),
            active: !!hasActiveFilters,
          },
          {
            label: "Export CSV",
            icon: Download,
            onClick: () =>
              exportToCsv(
                `amana-issues-${new Date().toISOString().slice(0, 10)}`,
                filteredIssues,
                [
                  { header: "ID", accessor: (i) => i.id },
                  { header: "Title", accessor: (i) => i.title },
                  { header: "Status", accessor: (i) => i.status },
                  { header: "Priority", accessor: (i) => i.priority },
                  { header: "Owner", accessor: (i) => i.owner?.name ?? "Unassigned" },
                  { header: "Raised By", accessor: (i) => i.raisedBy?.name ?? "" },
                  { header: "Centre", accessor: (i) => i.service?.name ?? "Company-wide" },
                  { header: "Identified", accessor: (i) => new Date(i.identifiedAt).toLocaleDateString("en-AU") },
                  { header: "Resolution", accessor: (i) => i.resolution ?? "" },
                ],
              ),
          },
        ]}
      >
        {/* AI Prioritize — kept inline since it's unique to Issues */}
        <AiButton
          templateSlug="issues/smart-prioritize"
          variables={{ issueList: issueListForAi }}
          onResult={(text) => setAiPrioritization(text)}
          label="AI Prioritize"
          size="sm"
          section="issues"
          disabled={openIssues.length === 0}
        />
      </PageHeader>

      {/* Status Tabs */}
      {viewMode === "list" && (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
          <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
            {statusTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {Icon && <Icon className={cn("w-3.5 h-3.5", isActive && tab.color)} />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Owners</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setPriorityFilter("");
                setOwnerFilter("");
              }}
              className="text-xs text-muted hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Saved Filter Presets */}
      <div className="mb-4">
        <FilterPresets
          pageKey="issues"
          currentFilters={{
            status: statusFilter,
            priority: priorityFilter,
            assignee: ownerFilter,
          }}
          onLoadPreset={(filters) => {
            setStatusFilter(filters.status || "");
            setPriorityFilter(filters.priority || "");
            setOwnerFilter(filters.assignee || "");
            if (!showFilters && (filters.priority || filters.assignee)) {
              setShowFilters(true);
            }
          }}
        />
      </div>

      {/* Error State */}
      {error && (
        <ErrorState
          title="Failed to load issues"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {/* Summary Bar */}
      {!error && issues && issues.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 px-1">
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">{stats.total}</span> Issues
          </span>
          <span className="text-border">|</span>
          <span className="text-sm text-amber-600">{stats.open} open</span>
          <span className="text-sm text-blue-600">{stats.discussing} discussing</span>
          <span className="text-sm text-success">{stats.solved} solved</span>
          {stats.critical > 0 && (
            <span className="text-sm text-danger font-medium">
              {stats.critical} critical
            </span>
          )}
        </div>
      )}

      {/* AI Prioritization Panel */}
      {aiPrioritization && (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                AI Issue Prioritization — IDS Recommended Order
              </p>
              <div className="flex-1 text-sm text-purple-900 whitespace-pre-wrap">{aiPrioritization}</div>
            </div>
            <button onClick={() => setAiPrioritization("")} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {error ? null : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-5 w-24 mb-2" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : issues && issues.length > 0 ? (
        viewMode === "board" ? (
          <IssueKanban issues={filteredIssues} onSelect={openDetail} showClosed={showArchived} />
        ) : (
          /* List View with checkboxes */
          <div className="space-y-2">
            {/* Select All header */}
            <div className="flex items-center gap-3 px-4 py-2">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand cursor-pointer"
                aria-label="Select all issues"
              />
              <span className="text-xs text-muted font-medium">
                {selectedIds.size > 0
                  ? `${selectedIds.size} of ${filteredIssues.length} selected`
                  : "Select all"}
              </span>
            </div>

            {filteredIssues.map((issue) => (
              <div key={issue.id} className="flex items-start gap-3">
                <div className="pt-4 pl-4 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(issue.id)}
                    onChange={() => toggleSelect(issue.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand cursor-pointer"
                    aria-label={`Select issue: ${issue.title}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <IssueCard
                    issue={issue}
                    onClick={(opts) => openDetail(issue.id, opts)}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <EmptyState
          icon={AlertCircle}
          title="No open issues"
          description="Issues are blockers and problems that need to be identified, discussed, and solved. Raise them here to keep the team aligned."
          iconColor="#F59E0B"
          action={{ label: "Raise Your First Issue", onClick: () => setShowCreate(true) }}
        />
      )}

      {/* Bulk Actions Floating Bar */}
      {hasBulkSelection && (
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-30 bg-card border border-border rounded-xl shadow-lg p-4 w-[95vw] max-w-2xl">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Count */}
            <span className="text-sm font-medium text-foreground/80 whitespace-nowrap">
              {selectedIds.size} selected
            </span>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {/* Resolve */}
              <button
                onClick={handleBulkResolve}
                disabled={bulkAction.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Resolve
              </button>

              {/* Assign To */}
              <div className="relative">
                <button
                  onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                  disabled={bulkAction.isPending}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 w-full sm:w-auto"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign To
                </button>
                {showAssignDropdown && (
                  <div className="absolute bottom-full mb-1 left-0 w-48 bg-card border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto z-40">
                    {users?.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleBulkAssign(u.id)}
                        className="w-full text-left px-3 py-1.5 text-sm text-foreground/80 hover:bg-surface transition-colors"
                      >
                        {u.name}
                      </button>
                    ))}
                    {(!users || users.length === 0) && (
                      <p className="px-3 py-1.5 text-sm text-muted">No users found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Move to Short-term */}
              <button
                onClick={() => handleBulkMove("short_term")}
                disabled={bulkAction.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" />
                Short-term
              </button>

              {/* Move to Long-term */}
              <button
                onClick={() => handleBulkMove("long_term")}
                disabled={bulkAction.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" />
                Long-term
              </button>

              {/* Delete */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={bulkAction.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>

              {/* Clear Selection */}
              <button
                onClick={clearSelection}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Issues"
        description={`Are you sure you want to delete ${selectedIds.size} issue(s)? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleBulkDelete}
        loading={bulkAction.isPending}
      />

      {/* Create Modal */}
      <CreateIssueModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Detail Panel */}
      <IssueDetailPanel
        open={!!selectedId}
        issueId={selectedId ?? ""}
        onClose={closeDetail}
        focus={detailFocus}
      />
    </div>
  );
}
