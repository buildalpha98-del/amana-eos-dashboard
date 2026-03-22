"use client";

import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectDetailPanel } from "@/components/projects/ProjectDetailPanel";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { TemplatePicker } from "@/components/projects/TemplatePicker";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  FolderKanban,
  Plus,
  Rocket,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";

const statusTabs = [
  { key: "", label: "All" },
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "complete", label: "Complete" },
  { key: "on_hold", label: "On Hold" },
];

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchTemplateId, setLaunchTemplateId] = useState<string | undefined>();
  const [view, setView] = useState<"grid" | "list">("grid");

  const { data: projects, isLoading, error, refetch } = useProjects(
    statusFilter ? { status: statusFilter } : undefined
  );

  const filtered = projects?.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.owner?.name ?? "").toLowerCase().includes(q) ||
      p.service?.name.toLowerCase().includes(q)
    );
  });

  const counts = {
    all: projects?.length || 0,
    inProgress:
      projects?.filter((p) => p.status === "in_progress").length || 0,
    complete: projects?.filter((p) => p.status === "complete").length || 0,
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Projects</h2>
          <p className="text-muted mt-1 line-clamp-2">
            Track project progress across your centres
          </p>
        </div>
        <ErrorState
          title="Failed to load projects"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Projects</h2>
          <p className="text-muted mt-1 line-clamp-2">
            Track project progress across your centres
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLaunch(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-brand text-brand text-sm font-medium rounded-lg hover:bg-brand/5 transition-colors"
          >
            <Rocket className="w-4 h-4" />
            Launch from Template
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Projects" value={counts.all} />
        <StatCard title="In Progress" value={counts.inProgress} valueColor="text-blue-600" />
        <StatCard title="Completed" value={counts.complete} valueColor="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                statusFilter === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "p-2 rounded-md",
              view === "grid"
                ? "bg-border text-foreground/80"
                : "text-muted hover:text-foreground"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "p-2 rounded-md",
              view === "list"
                ? "bg-border text-foreground/80"
                : "text-muted hover:text-foreground"
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
        </div>
      ) : filtered && filtered.length > 0 ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => setSelectedProjectId(project.id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border divide-y divide-border/50">
            {filtered.map((project) => {
              const status =
                {
                  not_started: { label: "Not Started", color: "text-muted bg-surface" },
                  in_progress: { label: "In Progress", color: "text-blue-700 bg-blue-100" },
                  complete: { label: "Complete", color: "text-emerald-700 bg-emerald-100" },
                  on_hold: { label: "On Hold", color: "text-amber-700 bg-amber-100" },
                  cancelled: { label: "Cancelled", color: "text-red-700 bg-red-100" },
                }[project.status] || { label: project.status, color: "text-muted bg-surface" };

              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {project.owner?.name ?? "Unassigned"}
                      {project.service && ` • ${project.service.name}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-medium rounded-full",
                      status.color
                    )}
                  >
                    {status.label}
                  </span>
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted">
                        {project.progress.percent}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full"
                        style={{ width: `${project.progress.percent}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <EmptyState
          icon={FolderKanban}
          title="No projects found"
          description={search ? "Try adjusting your search" : "Create your first project to get started"}
          variant="inline"
          {...(!search && {
            action: { label: "New Project", onClick: () => setShowCreate(true) },
          })}
        />
      )}

      {/* Detail Panel */}
      {selectedProjectId && (
        <ProjectDetailPanel
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}

      {/* Template Picker */}
      <TemplatePicker
        open={showLaunch}
        onClose={() => setShowLaunch(false)}
        onSelect={(templateId) => {
          setShowLaunch(false);
          setLaunchTemplateId(templateId);
          setShowCreate(true);
        }}
      />

      {/* Create Modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setLaunchTemplateId(undefined);
        }}
        preselectedTemplateId={launchTemplateId}
      />
    </div>
  );
}
