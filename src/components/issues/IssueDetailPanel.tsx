"use client";

import { useState } from "react";
import { useIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/useIssues";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  X,
  Trash2,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Mountain,
  CheckSquare,
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
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [resolution, setResolution] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

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
          <h3 className="text-base font-semibold text-gray-900">
            Issue Details
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
          {issue.rock && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Linked Rock
              </label>
              <div className="flex items-center gap-2 px-3 py-2 bg-[#004E64]/5 rounded-lg">
                <Mountain className="w-4 h-4 text-[#004E64]" />
                <span className="text-sm text-[#004E64] font-medium">
                  {issue.rock.title}
                </span>
              </div>
            </div>
          )}

          {/* Spawned Todos */}
          {issue.spawnedTodos && issue.spawnedTodos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Spawned To-Dos ({issue.spawnedTodos.length})
              </label>
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
            </div>
          )}

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
