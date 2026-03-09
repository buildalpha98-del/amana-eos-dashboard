"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Building2,
  CheckSquare,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import type { ProjectTodoItem } from "@/hooks/useDashboardData";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-gray-500" },
  in_progress: { label: "In Progress", color: "text-blue-600" },
};

export function DashboardProjectTodos({
  todos,
}: {
  todos: ProjectTodoItem[];
}) {
  const queryClient = useQueryClient();

  const toggleTodo = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "complete" }),
      });
      if (!res.ok) throw new Error("Failed to update todo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  if (!todos || todos.length === 0) {
    return null;
  }

  // Group todos by project
  const grouped = todos.reduce<Record<string, ProjectTodoItem[]>>(
    (acc, todo) => {
      const key = todo.projectId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(todo);
      return acc;
    },
    {}
  );

  const projectEntries = Object.entries(grouped);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-brand" />
          <h3 className="text-lg font-semibold text-gray-900">
            Project To-Dos
          </h3>
          <span className="text-xs text-gray-400 font-medium ml-1">
            {todos.length} active
          </span>
        </div>
        <Link
          href="/projects"
          className="text-sm text-brand hover:text-brand-hover font-medium inline-flex items-center gap-1 transition-colors"
        >
          View All Projects
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-4">
        {projectEntries.map(([projectId, projectTodos]) => {
          const first = projectTodos[0];
          return (
            <div key={projectId}>
              {/* Project header */}
              <div className="flex items-center gap-2 mb-2">
                <Link
                  href="/projects"
                  className="text-sm font-semibold text-gray-800 hover:text-brand transition-colors"
                >
                  {first.projectName}
                </Link>
                {first.serviceName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                    <Building2 className="w-3 h-3" />
                    {first.serviceName}
                  </span>
                )}
              </div>

              {/* Todo list */}
              <div className="space-y-1.5 pl-1">
                {projectTodos.map((todo) => {
                  const st =
                    statusConfig[todo.status] || statusConfig.pending;
                  const dueDate = new Date(todo.dueDate);
                  const formattedDue = dueDate.toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  });

                  return (
                    <div
                      key={todo.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleTodo.mutate(todo.id)}
                        disabled={toggleTodo.isPending}
                        className="w-4.5 h-4.5 rounded border-2 border-gray-300 hover:border-brand flex items-center justify-center flex-shrink-0 transition-colors"
                        title="Mark complete"
                      >
                        <CheckSquare className="w-0 h-0 group-hover:w-3 group-hover:h-3 text-brand transition-all" />
                      </button>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">
                          {todo.title}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {todo.assigneeName} &middot;{" "}
                          <span className={st.color}>{st.label}</span>
                        </p>
                      </div>

                      {/* Due date badge */}
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md shrink-0",
                          todo.isOverdue
                            ? "bg-red-50 text-red-600"
                            : "bg-gray-50 text-gray-500"
                        )}
                      >
                        {todo.isOverdue && (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {formattedDue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
