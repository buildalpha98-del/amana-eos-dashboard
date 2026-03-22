"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateAU, getWeekStart } from "@/lib/utils";
import { CheckSquare, Plus, X, Calendar, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface TodoData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string;
  assigneeId: string;
  assignee: { id: string; name: string; avatar: string | null };
  rock: { id: string; title: string } | null;
  issue: { id: string; title: string } | null;
}

interface UserOption {
  id: string;
  name: string;
}

const statusFilters = ["all", "pending", "in_progress", "complete"] as const;

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-300" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-300" },
  complete: { label: "Complete", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

function getNextStatus(current: string): string {
  if (current === "pending") return "in_progress";
  if (current === "in_progress") return "complete";
  return current;
}

type SortOption = "due_asc" | "due_desc" | "title" | "assignee";

export function ServiceTodosTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("due_asc");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigneeId: "",
    dueDate: "",
  });

  const { data: todos = [], isLoading } = useQuery<TodoData[]>({
    queryKey: ["todos", { serviceId }],
    queryFn: async () => {
      const res = await fetch(`/api/todos?serviceId=${serviceId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createTodo = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create to-do");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todos", { serviceId }] });
      setShowModal(false);
      setError(null);
      setFormData({ title: "", description: "", assigneeId: "", dueDate: "" });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", { serviceId }] });
    },
  });

  // Unique assignees for filter dropdown
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    todos.forEach((t) => {
      if (t.assignee) map.set(t.assignee.id, t.assignee.name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [todos]);

  const filteredTodos = useMemo(() => {
    let list = todos;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (assigneeFilter !== "all") list = list.filter((t) => t.assignee?.id === assigneeFilter);

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "due_asc":
          return (a.dueDate || "").localeCompare(b.dueDate || "");
        case "due_desc":
          return (b.dueDate || "").localeCompare(a.dueDate || "");
        case "title":
          return a.title.localeCompare(b.title);
        case "assignee":
          return (a.assignee?.name || "").localeCompare(b.assignee?.name || "");
        default:
          return 0;
      }
    });
  }, [todos, statusFilter, assigneeFilter, sortBy]);

  function handleCreate() {
    if (!formData.title || !formData.assigneeId || !formData.dueDate) return;
    setError(null);
    // Use date-only string + T00:00:00 to avoid timezone shifts
    const dueDateISO = `${formData.dueDate}T00:00:00`;
    const weekOf = getWeekStart(new Date(dueDateISO)).toISOString();
    createTodo.mutate({
      title: formData.title,
      description: formData.description || null,
      assigneeId: formData.assigneeId,
      dueDate: formData.dueDate,
      weekOf,
      serviceId,
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-brand" />
          Service To-Dos
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {statusFilters.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All Statuses" : statusConfig[f]?.label || f}
              </option>
            ))}
          </select>
          {assigneeOptions.length > 1 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">All Assignees</option>
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="due_asc">Due Date ↑</option>
            <option value="due_desc">Due Date ↓</option>
            <option value="title">Title A-Z</option>
            <option value="assignee">Assignee</option>
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add To-Do
          </button>
        </div>
      </div>

      {/* Todo List */}
      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-surface/50 rounded-lg">
              <Skeleton className="w-4.5 h-4.5 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredTodos.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted">
          No to-dos found.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredTodos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 px-3 py-2.5 bg-surface/50 rounded-lg hover:bg-surface transition-colors"
            >
              {/* Checkbox */}
              <button
                onClick={() => {
                  const nextStatus = getNextStatus(todo.status);
                  if (nextStatus !== todo.status) {
                    toggleStatus.mutate({ id: todo.id, status: nextStatus });
                  }
                }}
                disabled={todo.status === "complete" || todo.status === "cancelled"}
                className="flex-shrink-0"
              >
                <CheckSquare
                  className={cn(
                    "w-4.5 h-4.5",
                    todo.status === "complete"
                      ? "text-emerald-500"
                      : todo.status === "in_progress"
                      ? "text-blue-500"
                      : "text-muted/50 hover:text-muted"
                  )}
                />
              </button>

              {/* Title */}
              <span
                className={cn(
                  "flex-1 text-sm truncate",
                  todo.status === "complete"
                    ? "text-muted line-through"
                    : "text-foreground/80"
                )}
              >
                {todo.title}
              </span>

              {/* Linked rock/issue */}
              {todo.rock && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                  {todo.rock.title}
                </span>
              )}
              {todo.issue && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                  {todo.issue.title}
                </span>
              )}

              {/* Assignee */}
              <span className="text-xs text-muted whitespace-nowrap">
                {todo.assignee?.name ?? "Unassigned"}
              </span>

              {/* Due Date */}
              <span className="text-xs text-muted flex items-center gap-1 whitespace-nowrap">
                <Calendar className="w-3 h-3" />
                {formatDateAU(todo.dueDate)}
              </span>

              {/* Status Badge */}
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap",
                  statusConfig[todo.status]?.color || "bg-gray-100 text-gray-500 border-gray-300"
                )}
              >
                {statusConfig[todo.status]?.label || todo.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add To-Do Modal */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Add To-Do
                </h4>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-muted hover:text-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, title: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="What needs to be done?"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                    placeholder="Additional details..."
                  />
                </div>

                {/* Assignee */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Assignee <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.assigneeId}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, assigneeId: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Select assignee...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, dueDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="text-xs px-4 py-2 text-muted hover:text-foreground/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={
                    !formData.title ||
                    !formData.assigneeId ||
                    !formData.dueDate ||
                    createTodo.isPending
                  }
                  className={cn(
                    "text-xs px-4 py-2 rounded-lg font-medium transition-colors",
                    formData.title && formData.assigneeId && formData.dueDate
                      ? "bg-brand text-white hover:bg-brand/90"
                      : "bg-surface text-muted cursor-not-allowed"
                  )}
                >
                  {createTodo.isPending ? "Creating..." : "Create To-Do"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
