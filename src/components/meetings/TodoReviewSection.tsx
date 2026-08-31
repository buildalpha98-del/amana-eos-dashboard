"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import type { TodoData } from "@/hooks/useTodos";
import type { MeetingAttendee } from "@/hooks/useMeetings";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

export function TodoReviewSection({
  todos,
  onToggle,
  attendees,
  users,
  onQuickAdd,
  onReassign,
  onRedate,
  isCompleted = false,
  lastMeetingId,
}: {
  todos: TodoData[] | undefined;
  onToggle: (id: string, done: boolean) => void;
  /** Meeting attendees — listed first in the assignee pickers. */
  attendees?: MeetingAttendee[];
  /** Fallback assignee list (same list the IDS section uses). */
  users?: { id: string; name: string }[];
  onQuickAdd?: (data: { title: string; assigneeId: string; dueDate: string }) => void;
  onReassign?: (id: string, assigneeId: string) => void;
  onRedate?: (id: string, dueDate: string) => void;
  isCompleted?: boolean;
  /** Previous completed meeting of the same kind — drives the carry-over badge. */
  lastMeetingId?: string | null;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [newDueDate, setNewDueDate] = useState(defaultDueDate);

  // When the meeting has attendees, only they are assignable — the review
  // list filters to attendee-owned todos, so a todo assigned to anyone
  // else would be created fine but instantly vanish from this view.
  // Present attendees list first. Meetings without attendees fall back to
  // the full assignable-users list (matching the list's service fallback).
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; name: string }[] = [];
    if (attendees && attendees.length > 0) {
      const sorted = [...attendees].sort((a, b) =>
        a.status === b.status ? 0 : a.status === "present" ? -1 : 1,
      );
      for (const a of sorted) {
        if (!seen.has(a.userId)) {
          seen.add(a.userId);
          options.push({ id: a.userId, name: a.user.name });
        }
      }
      return options;
    }
    for (const u of users ?? []) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        options.push(u);
      }
    }
    return options;
  }, [attendees, users]);

  const canCapture = !isCompleted && !!onQuickAdd;
  const done = (todos ?? []).filter((t) => t.status === "complete").length;
  const total = todos?.length ?? 0;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const handleAdd = () => {
    if (!newTitle.trim() || !newAssigneeId || !onQuickAdd) return;
    onQuickAdd({
      title: newTitle.trim(),
      assigneeId: newAssigneeId,
      dueDate: newDueDate,
    });
    setNewTitle("");
    setNewDueDate(defaultDueDate());
  };

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-indigo-800 mb-1">
          To-Do Review
        </h4>
        <p className="text-xs text-indigo-600">
          Every open to-do for the people in this meeting, plus the
          ones completed last week. Mark done or not done as you go —
          90%+ completion is the goal. New commitments made in the room
          get captured right here.
        </p>
      </div>

      {/* Quick-add capture row (2026-08-31) */}
      {canCapture && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg border border-dashed border-border bg-surface/40">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="New commitment from this meeting…"
            aria-label="New to-do title"
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
          <select
            value={newAssigneeId}
            onChange={(e) => setNewAssigneeId(e.target.value)}
            aria-label="Assignee"
            className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="">Assign to…</option>
            {assigneeOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            aria-label="Due date"
            className="px-2 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
          <Button
            size="xs"
            onClick={handleAdd}
            disabled={!newTitle.trim() || !newAssigneeId}
            iconLeft={<Plus className="w-3.5 h-3.5" />}
          >
            Add
          </Button>
        </div>
      )}

      {(!todos || todos.length === 0) ? (
        <div className="text-center py-12 text-muted text-sm">
          No open to-dos for anyone in this meeting.
        </div>
      ) : (
        <>
          {/* Completion Rate */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-sm text-muted">
              <span className="font-semibold text-foreground">{done}</span> /{" "}
              {total} completed
            </span>
            <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct >= 90
                    ? "bg-emerald-500"
                    : pct >= 70
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={cn(
                "text-sm font-semibold",
                pct >= 90
                  ? "text-emerald-600"
                  : pct >= 70
                    ? "text-amber-600"
                    : "text-red-600"
              )}
            >
              {Math.round(pct)}%
            </span>
          </div>

          <div className="space-y-1">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface"
              >
                <button
                  onClick={() => onToggle(todo.id, todo.status !== "complete")}
                  aria-label={
                    todo.status === "complete"
                      ? `Mark "${todo.title}" not done`
                      : `Mark "${todo.title}" done`
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
                <div className="flex-1 min-w-0 flex items-center gap-2">
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
                  {lastMeetingId && todo.meetingId === lastMeetingId && (
                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-medium flex-shrink-0">
                      from last meeting
                    </span>
                  )}
                </div>
                {canCapture && onReassign && onRedate ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <select
                      value={todo.assigneeId ?? ""}
                      onChange={(e) =>
                        e.target.value && onReassign(todo.id, e.target.value)
                      }
                      aria-label={`Reassign "${todo.title}"`}
                      className="max-w-[110px] px-1.5 py-1 text-xs border border-border rounded-md bg-card text-muted focus:outline-none focus:ring-2 focus:ring-brand/20"
                    >
                      {!todo.assigneeId && <option value="">Unassigned</option>}
                      {assigneeOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name.split(" ")[0]}
                        </option>
                      ))}
                      {todo.assigneeId &&
                        !assigneeOptions.some((u) => u.id === todo.assigneeId) && (
                          <option value={todo.assigneeId}>
                            {(todo.assignee?.name ?? "Unknown").split(" ")[0]}
                          </option>
                        )}
                    </select>
                    <input
                      type="date"
                      defaultValue={todo.dueDate.split("T")[0]}
                      onChange={(e) =>
                        e.target.value && onRedate(todo.id, e.target.value)
                      }
                      aria-label={`Change due date for "${todo.title}"`}
                      className="px-1.5 py-1 text-xs border border-border rounded-md bg-card text-muted focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted flex-shrink-0">
                    {(todo.assignee?.name ?? "Unassigned").split(" ")[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
