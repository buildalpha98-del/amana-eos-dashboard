"use client";

import { useState, useMemo } from "react";
import { useIssues } from "@/hooks/useIssues";
import { useQuery } from "@tanstack/react-query";
import { IssueCard } from "@/components/issues/IssueCard";
import { IssueKanban } from "@/components/issues/IssueKanban";
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
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
  X,
} from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { HelpTooltip } from "@/components/shared/HelpTooltip";

interface UserOption {
  id: string;
  name: string;
}

const statusTabs = [
  { key: "", label: "All", icon: null },
  { key: "open", label: "Identify", icon: AlertTriangle, color: "text-amber-600" },
  { key: "in_discussion", label: "Discuss", icon: MessageSquare, color: "text-blue-600" },
  { key: "solved", label: "Solved", icon: CheckCircle2, color: "text-emerald-600" },
  { key: "closed", label: "Closed", icon: XCircle, color: "text-gray-400" },
] as const;

export default function IssuesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [showArchived, setShowArchived] = useState(false);
  const [aiPrioritization, setAiPrioritization] = useState("");

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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Issues <HelpTooltip term="ids" />
          </h2>
          <p className="text-sm text-gray-500">
            Track and resolve using IDS (Identify, Discuss, Solve)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "board"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Board view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Archive Toggle */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              showArchived
                ? "border-brand bg-brand/5 text-brand"
                : "border-gray-200 text-gray-400 hover:text-gray-600"
            )}
            title={showArchived ? "Hide closed issues" : "Show closed issues"}
          >
            <Archive className="w-4 h-4" />
          </button>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              hasActiveFilters
                ? "border-brand bg-brand/5 text-brand"
                : "border-gray-200 text-gray-400 hover:text-gray-600"
            )}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          <AiButton
            templateSlug="issues/smart-prioritize"
            variables={{ issueList: issueListForAi }}
            onResult={(text) => setAiPrioritization(text)}
            label="AI Prioritize"
            size="sm"
            section="issues"
            disabled={openIssues.length === 0}
          />

          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Raise Issue
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      {viewMode === "list" && (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
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
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
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
        <div className="mb-4 flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
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
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
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
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

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
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{stats.total}</span> Issues
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-amber-600">{stats.open} open</span>
          <span className="text-sm text-blue-600">{stats.discussing} discussing</span>
          <span className="text-sm text-emerald-600">{stats.solved} solved</span>
          {stats.critical > 0 && (
            <span className="text-sm text-red-600 font-medium">
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
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : issues && issues.length > 0 ? (
        viewMode === "board" ? (
          <IssueKanban issues={filteredIssues} onSelect={setSelectedId} />
        ) : (
          /* List View */
          <div className="space-y-2">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => setSelectedId(issue.id)}
              />
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

      {/* Create Modal */}
      <CreateIssueModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Detail Panel */}
      <IssueDetailPanel
        open={!!selectedId}
        issueId={selectedId ?? ""}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
