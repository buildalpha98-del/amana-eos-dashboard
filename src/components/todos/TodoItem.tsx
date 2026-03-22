"use client";

import type { TodoData } from "@/hooks/useTodos";
import { useUpdateTodo, useDeleteTodo } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { Mountain, AlertCircle, Trash2, Lock, Check } from "lucide-react";
import { useState, useRef, useCallback } from "react";

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
  const [justCompleted, setJustCompleted] = useState(false);

  // ── Swipe gesture state ──
  const swipeRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - startX.current;
    currentX.current = delta;
    if (Math.abs(delta) > 10) swiping.current = true;
    if (swipeRef.current && Math.abs(delta) > 10) {
      // Clamp to [-120, 120]
      const clamped = Math.max(-120, Math.min(120, delta));
      swipeRef.current.style.transform = `translateX(${clamped}px)`;
      swipeRef.current.style.transition = "none";
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (swipeRef.current) {
      swipeRef.current.style.transition = "transform 0.3s ease-out";
      swipeRef.current.style.transform = "";
    }
    const delta = currentX.current;
    if (delta > 80 && !isDone) {
      // Swipe right → complete
      setJustCompleted(true);
      updateTodo.mutate({ id: todo.id, status: "complete" });
    } else if (delta < -80) {
      // Swipe left → delete
      deleteTodo.mutate(todo.id);
    }
    currentX.current = 0;
    swiping.current = false;
  }, [isDone, todo.id, updateTodo, deleteTodo]);

  const toggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = isComplete ? "pending" : "complete";
    if (newStatus === "complete") setJustCompleted(true);
    updateTodo.mutate({
      id: todo.id,
      status: newStatus,
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
    <div className="relative overflow-hidden rounded-lg md:overflow-visible">
      {/* Swipe background indicators (mobile only) */}
      <div className="absolute inset-0 flex items-center justify-between px-5 md:hidden pointer-events-none" aria-hidden="true">
        <div className="flex items-center gap-2 text-success">
          <Check className="w-5 h-5" />
          <span className="text-xs font-medium">Done</span>
        </div>
        <div className="flex items-center gap-2 text-danger">
          <span className="text-xs font-medium">Delete</span>
          <Trash2 className="w-5 h-5" />
        </div>
      </div>
      <div
        ref={swipeRef}
        onClick={(e) => { if (!swiping.current) onClick?.(); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          "group relative flex items-start gap-3 px-4 py-3 rounded-lg border transition-all",
          onClick && "cursor-pointer",
          isDone
            ? "bg-surface/50 border-border/50"
            : isOverdue
            ? "bg-red-50/50 border-red-100"
            : "bg-card border-border hover:border-border",
          justCompleted && "animate-row-complete"
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
              ? "bg-accent border-accent"
              : "border-border md:opacity-0 md:group-hover:opacity-100 opacity-60"
          )}
        >
          {selected && (
            <svg className="w-2.5 h-2.5 text-foreground" viewBox="0 0 12 12" fill="none">
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
            ? "bg-brand border-brand"
            : "border-border hover:border-brand"
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
              isDone ? "text-muted line-through" : "text-foreground"
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
              isOverdue ? "text-red-600 font-medium" : "text-muted"
            )}
          >
            Due {dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>

          {/* Linked Rock */}
          {todo.rock && (
            <span className="inline-flex items-center gap-1 text-xs text-brand bg-brand/5 px-1.5 py-0.5 rounded">
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
            className="text-xs px-2 py-1 text-muted hover:text-foreground transition-colors"
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
          className="md:opacity-0 md:group-hover:opacity-100 opacity-60 p-1 text-muted/50 hover:text-red-500 transition-all"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      </div>
    </div>
  );
}
