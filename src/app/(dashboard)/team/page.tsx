"use client";

import { useState } from "react";
import { useTeam } from "@/hooks/useTeam";
import { OrgChartView } from "@/components/team/OrgChartView";
import { TeamListView } from "@/components/team/TeamListView";
import {
  Users,
  LayoutGrid,
  List,
  Mountain,
  CheckSquare,
  AlertCircle,
} from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

export default function TeamPage() {
  const { data: members, isLoading: teamLoading, error, refetch } = useTeam();
  const [viewMode, setViewMode] = useState<"chart" | "list">("chart");

  // Compute summary stats (from team performance data)
  const totalRocks =
    members?.reduce((s, m) => s + m.activeRocks, 0) || 0;
  const avgCompletion =
    members && members.length > 0
      ? Math.round(
          members.reduce((s, m) => s + m.todoCompletionPct, 0) /
            members.length
        )
      : 0;
  const totalIssues =
    members?.reduce((s, m) => s + m.openIssues, 0) || 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            {viewMode === "chart" ? "Accountability Chart" : "Performance List"}
          </h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {viewMode === "chart"
              ? "Organisational structure and seat assignments"
              : "Team performance metrics and individual stats"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ExportButton
            onClick={() =>
              exportToCsv(
                `amana-team-${new Date().toISOString().slice(0, 10)}`,
                members || [],
                [
                  { header: "ID", accessor: (m) => m.id },
                  { header: "Name", accessor: (m) => m.name },
                  { header: "Email", accessor: (m) => m.email },
                  { header: "Role", accessor: (m) => m.role },
                  { header: "Active Rocks", accessor: (m) => m.activeRocks },
                  { header: "Todos (Total)", accessor: (m) => m.totalTodos },
                  { header: "Todos (Completed)", accessor: (m) => m.completedTodos },
                  { header: "Todo Completion %", accessor: (m) => `${m.todoCompletionPct}%` },
                  { header: "Open Issues", accessor: (m) => m.openIssues },
                  { header: "Managed Services", accessor: (m) => m.managedServices },
                ],
              )
            }
            disabled={!members || members.length === 0}
          />
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("chart")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "chart"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Accountability Chart"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-white text-brand shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Performance List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats cards — only show on list view */}
      {viewMode === "list" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <Users className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Team Size
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamLoading ? "--" : members?.length || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <Mountain className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Active Rocks
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamLoading ? "--" : totalRocks}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <CheckSquare className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Avg Todo Completion
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamLoading ? "--" : `${avgCompletion}%`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <AlertCircle className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Open Issues
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {teamLoading ? "--" : totalIssues}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorState
          title="Failed to load team"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {/* Content */}
      {error ? null : viewMode === "chart" ? (
        <OrgChartView />
      ) : teamLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-brand rounded-full animate-spin" />
        </div>
      ) : members && members.length > 0 ? (
        <TeamListView members={members} />
      ) : (
        <EmptyState
          icon={Users}
          title="No team members"
          description="Add users in Settings to populate the team list."
          variant="inline"
        />
      )}
    </div>
  );
}
