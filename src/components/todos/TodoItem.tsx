"use client";

import type { TodoData } from "@/hooks/useTodos";
import { useUpdateTodo, useDeleteTodo } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { Mountain, AlertCircle, Trash2, Lock } from "lucide-react";
import { useState } from "react";

export function TodoItem({
  todo,
  onClick,
  selectable,
  selected,
  onToggleSelect,
}: {
  todo: TodoData;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [showConfirm, setShowConfirm] = useState(false);

  const isComplete = todo.status === "complete";
  const isCancelled = todo.status === "cancelled";
  const isDone = isComplete || isCancelled;

  const toggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateTodo.mutate({
      id: todo.id,
      status: isComplete ? "pending" : "complete",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTodo.mutate(todo.id);
    setShowConfirm(false);
  };

  const dueDate = new Date(todo.dueDate);
  const isOverdue =
    !isDone && dueDate < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 px-4 py-3 rounded-lg border transition-all",
        onClick && "cursor-pointer",
        isDone
          ? "bg-gray-50 border-gray-100"
          : isOverdue
          ? "bg-red-50/50 border-red-100"
          : "bg-white border-gray-200 hover:border-gray-300"
      )}
    >
      {/* Selection checkbox */}
      {selectable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className={cn(
            "mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
            selected
              ? "bg-[#FECE00] border-[#FECE00]"
              : "border-gray-200 opacity-0 group-hover:opacity-100"
          )}
        >
          {selected && (
            <svg className="w-2.5 h-2.5 text-gray-900" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}

      {/* Checkbox */}
      <button
        onClick={toggleComplete}
        disabled={updateTodo.isPending}
        className={cn(
          "mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center",
          isComplete
            ? "bg-[#004E64] border-[#004E64]"
            : "border-gray-300 hover:border-[#004E64]"
        )}
      >
        {isComplete && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "text-sm font-medium",
              isDone ? "text-gray-400 line-through" : "text-gray-900"
            )}
          >
            {todo.title}
          </p>
          {todo.isPrivate && (
            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {/* Due date */}
          <span
            className={cn(
              "text-xs",
              isOverdue ? "text-red-600 font-medium" : "text-gray-400"
            )}
          >
            Due {dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>

          {/* Linked Rock */}
          {todo.rock && (
            <span className="inline-flex items-center gap-1 text-xs text-[#004E64] bg-[#004E64]/5 px-1.5 py-0.5 rounded">
              <Mountain className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{todo.rock.title}</span>
            </span>
          )}

          {/* Linked Issue */}
          {todo.issue && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              <AlertCircle className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{todo.issue.title}</span>
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      {showConfirm ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDelete}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(false);
            }}
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
