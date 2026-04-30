"use client";

import { CheckCircle2 } from "lucide-react";
import type { TodoData } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

export function TodoReviewSection({
  todos,
  onToggle,
}: {
  todos: TodoData[] | undefined;
  onToggle: (id: string, done: boolean) => void;
}) {
  if (!todos || todos.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No to-dos for this week.
      </div>
    );
  }

  const done = todos.filter((t) => t.status === "complete").length;

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-indigo-800 mb-1">
          To-Do Review
        </h4>
        <p className="text-xs text-indigo-600">
          Go through each to-do from last week. Mark done or not done. 90%+
          completion rate is the goal.
        </p>
      </div>

      {/* Completion Rate */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-muted">
          <span className="font-semibold text-foreground">{done}</span> /{" "}
          {todos.length} completed
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (done / todos.length) * 100 >= 90
                ? "bg-emerald-500"
                : (done / todos.length) * 100 >= 70
                ? "bg-amber-500"
                : "bg-red-500"
            )}
            style={{
              width: `${todos.length > 0 ? (done / todos.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            (done / todos.length) * 100 >= 90
              ? "text-emerald-600"
              : (done / todos.length) * 100 >= 70
              ? "text-amber-600"
              : "text-red-600"
          )}
        >
          {todos.length > 0
            ? Math.round((done / todos.length) * 100)
            : 0}
          %
        </span>
      </div>

      <div className="space-y-1">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface"
          >
            <button
              onClick={() =>
                onToggle(todo.id, todo.status !== "complete")
              }
              className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                todo.status === "complete"
                  ? "bg-brand border-brand"
                  : "border-border hover:border-brand"
              )}
            >
              {todo.status === "complete" && (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm truncate",
                  todo.status === "complete"
                    ? "text-muted line-through"
                    : "text-foreground"
                )}
              >
                {todo.title}
              </p>
            </div>
            <span className="text-xs text-muted flex-shrink-0">
              {(todo.assignee?.name ?? "Unassigned").split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
