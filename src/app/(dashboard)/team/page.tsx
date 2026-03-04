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
import { cn } from "@/lib/utils";

export default function TeamPage() {
  const { data: members, isLoading: teamLoading } = useTeam();
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
            Accountability Chart
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {viewMode === "chart"
              ? "Organisational structure and seat assignments"
              : "Team performance metrics and individual stats"}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode("chart")}
            className={cn(
              "p-2 rounded-md transition-colors",
              viewMode === "chart"
                ? "bg-white text-[#004E64] shadow-sm"
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
                ? "bg-white text-[#004E64] shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            )}
            title="Performance List"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats cards — only show on list view */}
      {viewMode === "list" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#004E64]/10">
                <Users className="w-5 h-5 text-[#004E64]" />
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
              <div className="p-2 rounded-lg bg-[#004E64]/10">
                <Mountain className="w-5 h-5 text-[#004E64]" />
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
              <div className="p-2 rounded-lg bg-[#004E64]/10">
                <CheckSquare className="w-5 h-5 text-[#004E64]" />
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
              <div className="p-2 rounded-lg bg-[#004E64]/10">
                <AlertCircle className="w-5 h-5 text-[#004E64]" />
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

      {/* Content */}
      {viewMode === "chart" ? (
        <OrgChartView />
      ) : teamLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
        </div>
      ) : members && members.length > 0 ? (
        <TeamListView members={members} />
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Users className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">
            No team members
          </h3>
          <p className="text-gray-500 mt-2">
            Add users in Settings to populate the team list.
          </p>
        </div>
      )}
    </div>
  );
}
