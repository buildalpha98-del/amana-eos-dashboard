"use client";

import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Building2,
  User,
  Calendar,
} from "lucide-react";
import type { ProjectSummary } from "@/hooks/useProjects";

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "text-gray-600", bg: "bg-gray-100" },
  in_progress: { label: "In Progress", color: "text-blue-700", bg: "bg-blue-100" },
  complete: { label: "Complete", color: "text-emerald-700", bg: "bg-emerald-100" },
  on_hold: { label: "On Hold", color: "text-amber-700", bg: "bg-amber-100" },
  cancelled: { label: "Cancelled", color: "text-red-700", bg: "bg-red-100" },
};

export function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}) {
  const status = statusConfig[project.status] || statusConfig.not_started;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {project.name}
            </h3>
            <span
              className={cn(
                "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                status.bg,
                status.color
              )}
            >
              {status.label}
            </span>
          </div>

          {project.description && (
            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
              {project.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span>{project.owner?.name ?? "Unassigned"}</span>
            </div>
            {project.service && (
              <div className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>{project.service.name}</span>
              </div>
            )}
            {project.targetDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {new Date(project.targetDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand transition-colors flex-shrink-0 mt-1" />
      </div>

      {/* Progress bar */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">
            {project.progress.completed}/{project.progress.total} tasks
          </span>
          <span className="text-xs font-semibold text-gray-700">
            {project.progress.percent}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              project.progress.percent === 100
                ? "bg-emerald-500"
                : project.progress.percent > 50
                ? "bg-brand"
                : project.progress.percent > 0
                ? "bg-blue-500"
                : "bg-gray-200"
            )}
            style={{ width: `${project.progress.percent}%` }}
          />
        </div>
      </div>

      {project.template && (
        <p className="text-[10px] text-gray-400 mt-2">
          Template: {project.template.name}
        </p>
      )}
    </button>
  );
}
