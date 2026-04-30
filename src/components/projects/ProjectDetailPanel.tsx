"use client";

import { useState } from "react";
import { useProject, useUpdateProject, useDeleteProject } from "@/hooks/useProjects";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  X,
  Trash2,
  Building2,
  Calendar,
  CheckSquare,
  User,
  Plus,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/hooks/useToast";

interface UserOption {
  id: string;
  name: string;
}

const statusOptions = [
  { key: "not_started", label: "Not Started", color: "bg-surface text-muted border-border" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "on_hold", label: "On Hold", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700 border-red-300" },
] as const;

export function ProjectDetailPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const toggleTodo = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "complete" ? "pending" : "complete";
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update todo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const reassignTodo = useMutation({
    mutationFn: async ({ id, assigneeId }: { id: string; assigneeId: string }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) throw new Error("Failed to reassign todo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const addTask = useMutation({
    mutationFn: async (data: {
      title: string;
      assigneeId: string;
      dueDate: string;
      projectId: string;
      serviceId?: string | null;
    }) => {
      const now = new Date();
      const weekOf = new Date(now);
      weekOf.setDate(weekOf.getDate() - weekOf.getDay() + (weekOf.getDay() === 0 ? -6 : 1));
      weekOf.setHours(0, 0, 0, 0);

      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, weekOf: weekOf.toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTaskTitle("");
      setNewTaskAssignee("");
      setShowAddTask(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskAssignee) return;
    addTask.mutate({
      title: newTaskTitle,
      assigneeId: newTaskAssignee,
      dueDate: newTaskDueDate,
      projectId,
      serviceId: project?.service?.id || null,
    });
  };

  const handleDelete = () => {
    deleteProject.mutate(projectId, {
      onSuccess: () => {
        setShowDelete(false);
        onClose();
      },
    });
  };

  if (isLoading || !project) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card shadow-2xl border-l border-border z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  const completedTodos = project.todos.filter((t) => t.status === "complete").length;
  const progress = project.todos.length > 0 ? Math.round((completedTodos / project.todos.length) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card shadow-2xl border-l border-border z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">Project Details</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Status</label>
            <div className="flex gap-1 flex-wrap">
              {statusOptions.map((s) => (
                <button
                  key={s.key}
                  onClick={() => updateProject.mutate({ id: projectId, status: s.key })}
                  className={cn(
                    "px-2.5 py-1.5 text-[10px] font-medium rounded-md border transition-colors",
                    project.status === s.key ? s.color : "bg-card border-border text-muted hover:border-border"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <User className="w-4 h-4 text-muted" />
              <span>Owner: {project.owner?.name ?? "Unassigned"}</span>
            </div>
            {project.service && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Building2 className="w-4 h-4 text-muted" />
                <span>Centre: {project.service.name}</span>
              </div>
            )}
            {project.targetDate && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Calendar className="w-4 h-4 text-muted" />
                <span>
                  Target: {new Date(project.targetDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            )}
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">Progress</label>
              <span className="text-sm font-semibold text-foreground/80">{progress}%</span>
            </div>
            <div className="w-full h-3 bg-surface rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progress === 100 ? "bg-emerald-500" : progress > 50 ? "bg-brand" : "bg-blue-500")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-1">{completedTodos} of {project.todos.length} tasks complete</p>
          </div>

          {project.description && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">Description</label>
              <p className="text-sm text-muted">{project.description}</p>
            </div>
          )}

          {/* Task List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted uppercase tracking-wider">
                <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
                Tasks ({project.todos.length})
              </label>
              <button
                onClick={() => setShowAddTask(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            </div>

            {showAddTask && (
              <form onSubmit={handleAddTask} className="mb-3 p-3 bg-brand/5 rounded-lg border border-brand/20 space-y-2">
                <input
                  type="text"
                  autoFocus
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    required
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Assign to...</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    required
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addTask.isPending} className="px-3 py-1.5 text-xs bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50">
                    {addTask.isPending ? "Adding..." : "Add"}
                  </button>
                  <button type="button" onClick={() => setShowAddTask(false)} className="px-3 py-1.5 text-xs text-muted hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {project.todos.length > 0 ? (
              <div className="space-y-2">
                {project.todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors", todo.status === "complete" ? "bg-surface/50 border-border/50" : "bg-card border-border")}
                  >
                    <button
                      onClick={() => toggleTodo.mutate({ id: todo.id, status: todo.status })}
                      className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors", todo.status === "complete" ? "bg-emerald-500 border-emerald-500 text-white" : "border-border hover:border-brand")}
                    >
                      {todo.status === "complete" && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm truncate", todo.status === "complete" ? "line-through text-muted" : "text-foreground/80")}>{todo.title}</p>
                      <p className="text-[10px] text-muted">
                        Due {new Date(todo.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <select
                      value={todo.assignee?.id ?? ""}
                      onChange={(e) => reassignTodo.mutate({ id: todo.id, assigneeId: e.target.value })}
                      className="text-xs text-muted border-none bg-transparent focus:outline-none cursor-pointer"
                    >
                      {users?.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : !showAddTask ? (
              <button
                onClick={() => setShowAddTask(true)}
                className="w-full py-6 text-center text-sm text-muted border-2 border-dashed border-border rounded-lg hover:border-brand hover:text-brand transition-colors"
              >
                <Plus className="w-5 h-5 mx-auto mb-1" />
                Add the first task
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex justify-between">
          <button onClick={() => setShowDelete(true)} className="text-muted hover:text-danger transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <ConfirmDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Delete Project"
          description="Are you sure you want to delete this project and all its tasks? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          loading={deleteProject.isPending}
        />
      </div>
    </>
  );
}
