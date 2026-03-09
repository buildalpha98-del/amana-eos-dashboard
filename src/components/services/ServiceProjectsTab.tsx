"use client";

import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { ProjectDetailPanel } from "@/components/projects/ProjectDetailPanel";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Plus,
  User,
  Calendar,
  ChevronRight,
} from "lucide-react";

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  not_started: {
    label: "Not Started",
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  complete: {
    label: "Complete",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
  },
  on_hold: {
    label: "On Hold",
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-red-700",
    bg: "bg-red-100",
  },
};

export function ServiceProjectsTab({ serviceId }: { serviceId: string }) {
  const { data: projects, isLoading } = useProjects({ serviceId });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-brand" />
          <h3 className="text-base font-semibold text-gray-900">
            Projects ({projects?.length || 0})
          </h3>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Project List */}
      {projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => {
            const status =
              statusConfig[project.status] || statusConfig.not_started;
            return (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Left content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {project.name}
                      </h4>
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0",
                          status.bg,
                          status.color
                        )}
                      >
                        {status.label}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-xs text-gray-500 line-clamp-1 mb-2">
                        {project.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span>{project.owner?.name ?? "Unassigned"}</span>
                      </div>
                      {project.targetDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {new Date(project.targetDate).toLocaleDateString(
                              "en-AU",
                              { day: "numeric", month: "short", year: "numeric" }
                            )}
                          </span>
                        </div>
                      )}
                      {project.template && (
                        <span className="text-gray-400">
                          Template: {project.template.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="w-28 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">
                        {project.progress.completed}/{project.progress.total}{" "}
                        tasks
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

                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <FolderKanban className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm font-medium">
            No projects linked to this centre
          </p>
          <p className="text-gray-400 text-xs mt-1 max-w-xs">
            Create a project to track tasks and progress for this service centre.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {selectedProjectId && (
        <ProjectDetailPanel
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}

      {/* Create Modal - defaultServiceId pre-fills this centre */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultServiceId={serviceId}
      />
    </div>
  );
}
