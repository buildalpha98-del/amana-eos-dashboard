"use client";

import type {
  StaffOnboardingData,
  useDeleteOnboardingPack,
  useUpdateOnboardingPack,
  useUpdateOnboardingProgress,
} from "@/hooks/useOnboarding";
import {
  X,
  CheckCircle2,
  Circle,
  Clock,
  Building2,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Package,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const STATUS_COLORS = {
  not_started: { bg: "bg-surface", text: "text-muted", label: "Not Started" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completed" },
};

interface PackSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  service?: { name: string } | null;
  _count: { tasks: number; assignments: number };
}

interface SelectedPackData {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  tasks: { id: string; title: string; category: string; isRequired: boolean; sortOrder: number }[];
}

type UpdateProgressMutation = ReturnType<typeof useUpdateOnboardingProgress>;
type UpdatePackMutation = ReturnType<typeof useUpdateOnboardingPack>;
type DeletePackMutation = ReturnType<typeof useDeleteOnboardingPack>;

export interface OnboardingPacksTabProps {
  isStaff: boolean;
  isAdmin: boolean;
  assignments: StaffOnboardingData[];
  packs: PackSummary[];
  expandedAssignment: string | null;
  setExpandedAssignment: (id: string | null) => void;
  selectedPackId: string | null;
  setSelectedPackId: (id: string | null) => void;
  editingPackId: string | null;
  setEditingPackId: (id: string | null) => void;
  editPackName: string;
  setEditPackName: (v: string) => void;
  editPackDesc: string;
  setEditPackDesc: (v: string) => void;
  confirmDeletePackId: string | null;
  setConfirmDeletePackId: (id: string | null) => void;
  selectedPackData: SelectedPackData | undefined;
  selectedPackLoading: boolean;
  updateProgress: UpdateProgressMutation;
  editPackMutation: UpdatePackMutation;
  deletePackMutation: DeletePackMutation;
  handleToggleTask: (assignment: StaffOnboardingData, taskId: string, currentCompleted: boolean) => Promise<void> | void;
  startEditPack: (pack: { id: string; name: string; description: string | null }) => void;
  saveEditPack: () => Promise<void> | void;
  handleDeletePack: (id: string) => Promise<void> | void;
}

export function OnboardingPacksTab({
  isStaff,
  isAdmin,
  assignments,
  packs,
  expandedAssignment,
  setExpandedAssignment,
  selectedPackId,
  setSelectedPackId,
  editingPackId,
  setEditingPackId,
  editPackName,
  setEditPackName,
  editPackDesc,
  setEditPackDesc,
  confirmDeletePackId,
  setConfirmDeletePackId,
  selectedPackData,
  selectedPackLoading,
  updateProgress,
  editPackMutation,
  deletePackMutation,
  handleToggleTask,
  startEditPack,
  saveEditPack,
  handleDeletePack,
}: OnboardingPacksTabProps) {
  return (
    <div className="space-y-6">
      {/* My Assignments (for staff) or All Assignments (for admin) */}
      {assignments.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">
            {isStaff ? "My Onboarding" : "Active Assignments"}
          </h3>
          <div className="space-y-3">
            {assignments.map((assignment) => {
              const status = STATUS_COLORS[assignment.status] || STATUS_COLORS.not_started;
              const totalTasks = assignment.progress.length;
              const completedTasks = assignment.progress.filter(p => p.completed).length;
              const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              const isExpanded = expandedAssignment === assignment.id;

              return (
                <div key={assignment.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedAssignment(isExpanded ? null : assignment.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-surface transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-brand" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{assignment.pack.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                          {!isStaff && <span>{assignment.user.name}</span>}
                          {assignment.pack.service && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {assignment.pack.service.name}
                            </span>
                          )}
                          {assignment.dueDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Due {new Date(assignment.dueDate).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", status.bg, status.text)}>
                          {status.label}
                        </span>
                        <p className="text-xs text-muted mt-1">{completedTasks}/{totalTasks} tasks</p>
                      </div>
                      <div className="w-20">
                        <div className="h-2 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3 space-y-2">
                      {assignment.progress.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 py-1.5">
                          <button
                            onClick={() => handleToggleTask(assignment, p.taskId, p.completed)}
                            disabled={updateProgress.isPending}
                            className="flex-shrink-0"
                          >
                            {p.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-muted/50 hover:text-brand" />
                            )}
                          </button>
                          <div className="flex-1">
                            <p className={cn("text-sm", p.completed ? "text-muted line-through" : "text-foreground")}>
                              {p.task.title}
                            </p>
                            {p.task.category && (
                              <span className="text-xs text-muted">{p.task.category}</span>
                            )}
                          </div>
                          {p.task.isRequired && (
                            <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Packs Library (admin view) */}
      {isAdmin && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">Onboarding Packs</h3>
          {packs.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No onboarding packs yet"
              description="Create your first pack to start onboarding new staff."
              variant="inline"
            />
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packs.map((pack) => (
                <div key={pack.id} onClick={() => setSelectedPackId(selectedPackId === pack.id ? null : pack.id)} className={cn("bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer", selectedPackId === pack.id && "ring-2 ring-brand border-brand")}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-cyan-700" />
                    </div>
                    {pack.isDefault && (
                      <span className="text-[10px] font-bold uppercase bg-accent text-brand px-2 py-0.5 rounded-full">Default</span>
                    )}
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">{pack.name}</h4>
                  {pack.description && (
                    <p className="text-sm text-muted line-clamp-2 mb-2">{pack.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted mt-3">
                    <span>{pack._count.tasks} tasks</span>
                    <span>{pack._count.assignments} assigned</span>
                    {pack.service && <span>{pack.service.name}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Pack Detail Panel */}
            {selectedPackId && (
              <div className="bg-card rounded-xl border border-border p-6 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-cyan-700" />
                    </div>
                    {editingPackId === selectedPackId ? (
                      <div className="flex-1 space-y-2">
                        <input
                          value={editPackName}
                          onChange={(e) => setEditPackName(e.target.value)}
                          className="w-full text-lg font-semibold text-foreground border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand focus:border-brand outline-none"
                          placeholder="Pack name"
                        />
                        <input
                          value={editPackDesc}
                          onChange={(e) => setEditPackDesc(e.target.value)}
                          className="w-full text-sm text-muted border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand focus:border-brand outline-none"
                          placeholder="Description (optional)"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEditPack}
                            disabled={editPackMutation.isPending}
                            className="px-3 py-1 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand/90 disabled:opacity-50"
                          >
                            {editPackMutation.isPending ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingPackId(null)}
                            className="px-3 py-1 text-xs font-medium text-muted bg-surface rounded-lg hover:bg-border"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h4 className="text-lg font-semibold text-foreground">
                          {selectedPackData?.name ?? packs.find(p => p.id === selectedPackId)?.name ?? "Pack Details"}
                        </h4>
                        {selectedPackData?.isDefault && (
                          <span className="text-[10px] font-bold uppercase bg-accent text-brand px-2 py-0.5 rounded-full">Default</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && editingPackId !== selectedPackId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const pack = selectedPackData ?? packs.find(p => p.id === selectedPackId);
                            if (pack) startEditPack({ id: pack.id, name: pack.name, description: pack.description });
                          }}
                          className="p-1.5 text-muted hover:text-brand hover:bg-surface rounded-lg transition-colors"
                          title="Edit pack"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeletePackId === selectedPackId ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                            <span className="text-xs text-red-600 font-medium">Delete?</span>
                            <button
                              onClick={() => handleDeletePack(selectedPackId!)}
                              disabled={deletePackMutation.isPending}
                              className="px-2 py-0.5 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
                            >
                              {deletePackMutation.isPending ? "..." : "Yes"}
                            </button>
                            <button
                              onClick={() => setConfirmDeletePackId(null)}
                              className="px-2 py-0.5 text-xs font-medium text-muted bg-card border border-border rounded hover:bg-surface"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeletePackId(selectedPackId); }}
                            className="p-1.5 text-muted hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete pack"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setSelectedPackId(null); setEditingPackId(null); setConfirmDeletePackId(null); }} className="p-1.5 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {selectedPackLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-muted animate-spin" />
                    <span className="ml-2 text-sm text-muted">Loading pack details...</span>
                  </div>
                ) : selectedPackData ? (
                  <div className="space-y-4">
                    {selectedPackData.description && (
                      <p className="text-sm text-muted">{selectedPackData.description}</p>
                    )}

                    <div>
                      <h5 className="text-sm font-medium text-foreground/80 mb-2">Tasks ({selectedPackData.tasks.length})</h5>
                      <div className="space-y-2">
                        {selectedPackData.tasks
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((task) => (
                            <div key={task.id} className="flex items-center gap-3 py-2 px-3 bg-surface/50 rounded-lg">
                              <CheckCircle2 className="w-4 h-4 text-muted/50 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{task.title}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[10px] font-medium bg-border text-muted px-2 py-0.5 rounded-full capitalize">
                                  {task.category.replace("_", " ")}
                                </span>
                                {task.isRequired && (
                                  <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8 text-sm text-muted">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Could not load pack details.
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Empty state for staff */}
      {isStaff && assignments.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-muted text-lg">All caught up!</p>
          <p className="text-muted text-sm mt-1">You have no onboarding tasks assigned.</p>
        </div>
      )}
    </div>
  );
}
