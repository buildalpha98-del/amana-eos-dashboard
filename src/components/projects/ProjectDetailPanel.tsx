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
} from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

const statusOptions = [
  { key: "not_started", label: "Not Started", color: "bg-gray-100 text-gray-600 border-gray-300" },
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

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Toggle todo status
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
  });

  // Reassign todo
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
  });

  const handleDelete = () => {
    deleteProject.mutate(projectId, { onSuccess: onClose });
  };

  if (isLoading || !project) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B4D3E] border-t-transparent rounded-full" />
      </div>
    );
  }

  const completedTodos = project.todos.filter(
    (t) => t.status === "complete"
  ).length;
  const progress =
    project.todos.length > 0
      ? Math.round((completedTodos / project.todos.length) * 100)
      : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            Project Details
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title */}
          <h2 className="text-lg font-semibold text-gray-900">
            {project.name}
          </h2>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Status
            </label>
            <div className="flex gap-1 flex-wrap">
              {statusOptions.map((s) => (
                <button
                  key={s.key}
                  onClick={() =>
                    updateProject.mutate({ id: projectId, status: s.key })
                  }
                  className={cn(
                    "px-2.5 py-1.5 text-[10px] font-medium rounded-md border transition-colors",
                    project.status === s.key
                      ? s.color
                      : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4 text-gray-400" />
              <span>Owner: {project.owner.name}</span>
            </div>
            {project.service && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span>Centre: {project.service.name}</span>
              </div>
            )}
            {project.targetDate && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>
                  Target:{" "}
                  {new Date(project.targetDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Progress
              </label>
              <span className="text-sm font-semibold text-gray-700">
                {progress}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progress === 100
                    ? "bg-emerald-500"
                    : progress > 50
                    ? "bg-[#1B4D3E]"
                    : "bg-blue-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {completedTodos} of {project.todos.length} tasks complete
            </p>
          </div>

          {/* Description */}
          {project.description && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Description
              </label>
              <p className="text-sm text-gray-600">{project.description}</p>
            </div>
          )}

          {/* Task List */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
              Tasks ({project.todos.length})
            </label>
            {project.todos.length > 0 ? (
              <div className="space-y-2">
                {project.todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                      todo.status === "complete"
                        ? "bg-gray-50 border-gray-100"
                        : "bg-white border-gray-200"
                    )}
                  >
                    <button
                      onClick={() =>
                        toggleTodo.mutate({
                          id: todo.id,
                          status: todo.status,
                        })
                      }
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        todo.status === "complete"
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-gray-300 hover:border-[#1B4D3E]"
                      )}
                    >
                      {todo.status === "complete" && (
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm truncate",
                          todo.status === "complete"
                            ? "line-through text-gray-400"
                            : "text-gray-700"
                        )}
                      >
                        {todo.title}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Due{" "}
                        {new Date(todo.dueDate).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <select
                      value={todo.assignee.id}
                      onChange={(e) =>
                        reassignTodo.mutate({
                          id: todo.id,
                          assigneeId: e.target.value,
                        })
                      }
                      className="text-xs text-gray-500 border-none bg-transparent focus:outline-none cursor-pointer"
                    >
                      {users?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No tasks yet</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3 flex justify-between">
          {showDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete this project?</span>
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="text-xs px-3 py-1 text-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDelete(true)}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
