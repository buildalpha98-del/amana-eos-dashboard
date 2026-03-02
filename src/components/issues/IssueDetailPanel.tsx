"use client";

import { useState } from "react";
import { useIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/useIssues";
import { useCreateTodo } from "@/hooks/useTodos";
import { useRocks } from "@/hooks/useRocks";
import { useQuery } from "@tanstack/react-query";
import { cn, getWeekStart, getCurrentQuarter } from "@/lib/utils";
import {
  X,
  Trash2,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Mountain,
  CheckSquare,
  Plus,
  Link2,
  Unlink,
  Clock,
} from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

const statusSteps = [
  { key: "open", label: "Identify", icon: AlertTriangle, color: "text-amber-600 border-amber-400 bg-amber-50" },
  { key: "in_discussion", label: "Discuss", icon: MessageSquare, color: "text-blue-600 border-blue-400 bg-blue-50" },
  { key: "solved", label: "Solve", icon: CheckCircle2, color: "text-emerald-600 border-emerald-400 bg-emerald-50" },
  { key: "closed", label: "Closed", icon: XCircle, color: "text-gray-400 border-gray-300 bg-gray-50" },
] as const;

const priorities = ["critical", "high", "medium", "low"] as const;

export function IssueDetailPanel({
  issueId,
  onClose,
}: {
  issueId: string;
  onClose: () => void;
}) {
  const { data: issue, isLoading } = useIssue(issueId);
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const createTodo = useCreateTodo();
  const { data: rocks } = useRocks(getCurrentQuarter());
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [resolution, setResolution] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");
  const [newTodoDueDate, setNewTodoDueDate] = useState("");
  const [showRockPicker, setShowRockPicker] = useState(false);

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleAddTodo = () => {
    if (!newTodoTitle.trim() || !newTodoAssignee) return;
    const weekStart = getWeekStart();
    createTodo.mutate(
      {
        title: newTodoTitle.trim(),
        assigneeId: newTodoAssignee,
        issueId,
        dueDate: newTodoDueDate || new Date(weekStart.getTime() + 6 * 86400000).toISOString().split("T")[0],
        weekOf: weekStart.toISOString(),
      },
      {
        onSuccess: () => {
          setNewTodoTitle("");
          setNewTodoAssignee("");
          setNewTodoDueDate("");
          setShowAddTodo(false);
        },
      }
    );
  };

  const handleDelete = () => {
    deleteIssue.mutate(issueId, { onSuccess: onClose });
  };

  if (isLoading || !issue) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">
              Issue Details
            </h3>
            {issue.status !== "closed" && issue.status !== "solved" && (() => {
              const daysOpen = Math.floor((Date.now() - new Date(issue.identifiedAt).getTime()) / 86400000);
              return (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                    daysOpen >= 14
                      ? "bg-red-100 text-red-700"
                      : daysOpen >= 7
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {daysOpen}d open
                </span>
              );
            })()}
          </div>
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
          {editTitle ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateIssue.mutate({ id: issueId, title });
                    setEditTitle(false);
                  }
                  if (e.key === "Escape") setEditTitle(false);
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    updateIssue.mutate({ id: issueId, title });
                    setEditTitle(false);
                  }}
                  className="text-xs px-3 py-1 bg-[#004E64] text-white rounded-md"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditTitle(false)}
                  className="text-xs px-3 py-1 text-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <h2
              className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-[#004E64] transition-colors"
              onClick={() => {
                setTitle(issue.title);
                setEditTitle(true);
              }}
            >
              {issue.title}
            </h2>
          )}

          {/* IDS Status Stepper */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              IDS Status
            </label>
            <div className="flex gap-1">
              {statusSteps.map((step) => {
                const Icon = step.icon;
                const isActive = issue.status === step.key;
                const statusOrder = statusSteps.map((s) => s.key);
                const currentIdx = statusOrder.indexOf(issue.status);
                const stepIdx = statusOrder.indexOf(step.key);
                const isPast = stepIdx < currentIdx;

                return (
                  <button
                    key={step.key}
                    onClick={() =>
                      updateIssue.mutate({
                        id: issueId,
                        status: step.key,
                      })
                    }
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border-2 transition-all text-center",
                      isActive
                        ? step.color
                        : isPast
                        ? "border-gray-200 bg-gray-50 text-gray-400"
                        : "border-gray-100 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-500"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Priority
            </label>
            <div className="flex gap-1">
              {priorities.map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    updateIssue.mutate({ id: issueId, priority: p })
                  }
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors capitalize",
                    issue.priority === p
                      ? p === "critical"
                        ? "bg-red-100 border-red-300 text-red-700"
                        : p === "high"
                        ? "bg-orange-100 border-orange-300 text-orange-700"
                        : p === "medium"
                        ? "bg-yellow-100 border-yellow-300 text-yellow-700"
                        : "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Owner
            </label>
            <select
              value={issue.ownerId || ""}
              onChange={(e) =>
                updateIssue.mutate({
                  id: issueId,
                  ownerId: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
            >
              <option value="">Unassigned</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              defaultValue={issue.description || ""}
              onBlur={(e) =>
                updateIssue.mutate({
                  id: issueId,
                  description: e.target.value || null,
                })
              }
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
              placeholder="Describe the issue..."
            />
          </div>

          {/* Resolution (shown for solved/closed) */}
          {(issue.status === "solved" || issue.status === "closed") && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Resolution
              </label>
              <textarea
                defaultValue={issue.resolution || ""}
                onChange={(e) => setResolution(e.target.value)}
                onBlur={() =>
                  updateIssue.mutate({
                    id: issueId,
                    resolution: resolution || null,
                  })
                }
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
                placeholder="How was this resolved?"
              />
            </div>
          )}

          {/* Linked Rock */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Linked Rock
            </label>
            {issue.rock && !showRockPicker ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#004E64]/5 rounded-lg">
                <Mountain className="w-4 h-4 text-[#004E64]" />
                <span className="text-sm text-[#004E64] font-medium flex-1 truncate">
                  {issue.rock.title}
                </span>
                <button
                  onClick={() => setShowRockPicker(true)}
                  className="p-1 text-gray-400 hover:text-[#004E64] transition-colors"
                  title="Change rock"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => updateIssue.mutate({ id: issueId, rockId: null })}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Unlink rock"
                >
                  <Unlink className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : showRockPicker || !issue.rock ? (
              <div className="space-y-2">
                <select
                  value={issue.rockId || ""}
                  onChange={(e) => {
                    updateIssue.mutate({ id: issueId, rockId: e.target.value || null });
                    setShowRockPicker(false);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                >
                  <option value="">No linked rock</option>
                  {rocks?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                {showRockPicker && (
                  <button
                    onClick={() => setShowRockPicker(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Spawned Todos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spawned To-Dos{issue.spawnedTodos && issue.spawnedTodos.length > 0 ? ` (${issue.spawnedTodos.length})` : ""}
              </label>
              {!showAddTodo && (
                <button
                  onClick={() => setShowAddTodo(true)}
                  className="inline-flex items-center gap-1 text-xs text-[#004E64] hover:text-[#003D52] font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add To-Do
                </button>
              )}
            </div>

            {/* Inline Add Todo Form */}
            {showAddTodo && (
              <div className="mb-3 p-3 border border-[#004E64]/20 bg-[#004E64]/5 rounded-lg space-y-2">
                <input
                  autoFocus
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="To-do title..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTodo();
                    if (e.key === "Escape") setShowAddTodo(false);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newTodoAssignee}
                    onChange={(e) => setNewTodoAssignee(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                  >
                    <option value="">Assignee...</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={newTodoDueDate}
                    onChange={(e) => setNewTodoDueDate(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddTodo}
                    disabled={!newTodoTitle.trim() || !newTodoAssignee || createTodo.isPending}
                    className="text-xs px-3 py-1 bg-[#004E64] text-white rounded-md hover:bg-[#003D52] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createTodo.isPending ? "Creating..." : "Create To-Do"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddTodo(false);
                      setNewTodoTitle("");
                      setNewTodoAssignee("");
                      setNewTodoDueDate("");
                    }}
                    className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {issue.spawnedTodos && issue.spawnedTodos.length > 0 && (
              <div className="space-y-1.5">
                {issue.spawnedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                  >
                    <CheckSquare
                      className={cn(
                        "w-4 h-4",
                        todo.status === "complete"
                          ? "text-emerald-500"
                          : "text-gray-400"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm flex-1",
                        todo.status === "complete"
                          ? "line-through text-gray-400"
                          : "text-gray-700"
                      )}
                    >
                      {todo.title}
                    </span>
                    <span className="text-xs text-gray-400">
                      {todo.assignee.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(!issue.spawnedTodos || issue.spawnedTodos.length === 0) && !showAddTodo && (
              <p className="text-xs text-gray-400">No to-dos linked yet</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="text-xs text-gray-400 space-y-1 pt-4 border-t border-gray-100">
            <p>
              Identified:{" "}
              {new Date(issue.identifiedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            {issue.discussedAt && (
              <p>
                Discussed:{" "}
                {new Date(issue.discussedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
            {issue.solvedAt && (
              <p>
                Solved:{" "}
                {new Date(issue.solvedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
            <p>Raised by: {issue.raisedBy.name}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3 flex justify-between">
          {showDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete this issue?</span>
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
