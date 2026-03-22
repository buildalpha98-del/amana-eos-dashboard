"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Calendar, Flag, User, FolderOpen, FileText, Plus, CheckSquare, Square } from "lucide-react";
import {
  useMarketingTask,
  useUpdateMarketingTask,
  useDeleteMarketingTask,
  useCampaigns,
} from "@/hooks/useMarketing";
import type { MarketingTaskData } from "@/hooks/useMarketing";
import type {
  MarketingTaskStatus,
  MarketingTaskPriority,
} from "@prisma/client";

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

const STATUSES: { value: MarketingTaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
];

const PRIORITIES: { value: MarketingTaskPriority; label: string; color: string }[] = [
  { value: "high", label: "High", color: "text-red-600 bg-red-50 border-red-200" },
  { value: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "low", label: "Low", color: "text-green-600 bg-green-50 border-green-200" },
];

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading } = useMarketingTask(taskId);
  const updateTask = useUpdateMarketingTask();
  const deleteTask = useDeleteMarketingTask();
  const { data: campaigns } = useCampaigns({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<MarketingTaskStatus>("todo");
  const [priority, setPriority] = useState<MarketingTaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [subtasks, setSubtasks] = useState<{ text: string; done: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  // Fetch users for assignee dropdown
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch(() => {});
  }, []);

  // Sync local state when data loads
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(
        task.dueDate
          ? new Date(task.dueDate).toISOString().split("T")[0]
          : ""
      );
      setAssigneeId(task.assigneeId ?? "");
      setCampaignId(task.campaignId ?? "");
      setSubtasks(
        Array.isArray(task.subtasks) ? task.subtasks : []
      );
    }
  }, [task]);

  function autoSave(field: string, value: string | null) {
    updateTask.mutate({ id: taskId, [field]: value });
  }

  function handleStatusChange(newStatus: MarketingTaskStatus) {
    setStatus(newStatus);
    updateTask.mutate({ id: taskId, status: newStatus });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteTask.mutate(taskId, {
      onSuccess: () => onClose(),
    });
  }

  function saveSubtasks(updated: { text: string; done: boolean }[]) {
    setSubtasks(updated);
    updateTask.mutate({ id: taskId, subtasks: updated });
  }

  function addSubtask() {
    if (!newSubtask.trim()) return;
    const updated = [...subtasks, { text: newSubtask.trim(), done: false }];
    setNewSubtask("");
    saveSubtasks(updated);
  }

  function toggleSubtask(index: number) {
    const updated = subtasks.map((s, i) =>
      i === index ? { ...s, done: !s.done } : s
    );
    saveSubtasks(updated);
  }

  function removeSubtask(index: number) {
    const updated = subtasks.filter((_, i) => i !== index);
    saveSubtasks(updated);
  }

  const isOverdue =
    dueDate && new Date(dueDate) < new Date(new Date().toDateString());
  const isToday =
    dueDate &&
    new Date(dueDate).toDateString() === new Date().toDateString();

  if (isLoading) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
        <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg items-center justify-center bg-card shadow-xl">
          <p className="text-muted">Loading task...</p>
        </div>
      </>
    );
  }

  if (!task) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
        <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg items-center justify-center bg-card shadow-xl">
          <p className="text-muted">Task not found</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex-1 mr-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => autoSave("title", title)}
              className="text-lg font-semibold text-foreground bg-transparent border-none outline-none focus:ring-0 w-full"
            />
            {/* Priority Badge */}
            <div className="mt-1.5">
              {PRIORITIES.map((p) =>
                p.value === priority ? (
                  <span
                    key={p.value}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${p.color}`}
                  >
                    <Flag className="h-2.5 w-2.5" />
                    {p.label} Priority
                  </span>
                ) : null
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDelete}
              className={`rounded-lg p-2 text-sm transition-colors ${
                confirmDelete
                  ? "bg-red-600 text-white"
                  : "text-red-500 hover:bg-red-50"
              }`}
              title={confirmDelete ? "Click again to confirm" : "Delete task"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Buttons */}
        <div className="flex gap-1 border-b border-border px-6 py-3 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                status === s.value
                  ? "bg-brand text-white"
                  : "border border-border text-muted hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="space-y-4 px-6 py-4">
          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => autoSave("description", description || null)}
              rows={4}
              placeholder="Add a description..."
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Subtasks / Checklist */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <CheckSquare className="h-3 w-3" />
                Subtasks
                {subtasks.length > 0 && (
                  <span className="text-muted normal-case tracking-normal">
                    ({subtasks.filter((s) => s.done).length}/{subtasks.length})
                  </span>
                )}
              </span>
            </label>

            {/* Progress bar */}
            {subtasks.length > 0 && (
              <div className="w-full bg-surface rounded-full h-1.5 mb-2">
                <div
                  className="bg-brand h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round(
                      (subtasks.filter((s) => s.done).length / subtasks.length) * 100
                    )}%`,
                  }}
                />
              </div>
            )}

            {/* Subtask items */}
            <div className="space-y-1">
              {subtasks.map((st, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:bg-surface transition-colors"
                >
                  <button
                    onClick={() => toggleSubtask(i)}
                    className="shrink-0 text-muted hover:text-brand transition-colors"
                  >
                    {st.done ? (
                      <CheckSquare className="h-4 w-4 text-brand" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      st.done
                        ? "text-muted line-through"
                        : "text-foreground"
                    }`}
                  >
                    {st.text}
                  </span>
                  <button
                    onClick={() => removeSubtask(i)}
                    className="shrink-0 md:opacity-0 md:group-hover:opacity-100 opacity-60 text-muted/50 hover:text-danger transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add subtask input */}
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a subtask..."
                className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                className="shrink-0 rounded-lg p-1.5 text-brand hover:bg-brand/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => {
                const val = e.target.value as MarketingTaskPriority;
                setPriority(val);
                updateTask.mutate({ id: taskId, priority: val });
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Due Date
                {isOverdue && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                    OVERDUE
                  </span>
                )}
                {isToday && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                    TODAY
                  </span>
                )}
              </span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={() =>
                autoSave(
                  "dueDate",
                  dueDate ? new Date(dueDate).toISOString() : null
                )
              }
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${
                isOverdue
                  ? "border-red-300 bg-red-50"
                  : isToday
                  ? "border-amber-300 bg-amber-50"
                  : "border-border"
              }`}
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                Assignee
              </span>
            </label>
            <select
              value={assigneeId}
              onChange={(e) => {
                setAssigneeId(e.target.value);
                autoSave("assigneeId", e.target.value || null);
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <FolderOpen className="h-3 w-3" />
                Campaign
              </span>
            </label>
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                autoSave("campaignId", e.target.value || null);
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">None</option>
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Linked Post */}
          {task.post && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Linked Post
                </span>
              </label>
              <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
                <span className="text-sm font-medium text-foreground/80">
                  {task.post.title}
                </span>
              </div>
            </div>
          )}

          {/* Linked Service */}
          {task.service && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                Centre
              </label>
              <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
                <span className="inline-flex items-center rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {task.service.name} ({task.service.code})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="border-t border-border px-6 py-4">
          <div className="grid grid-cols-2 gap-3 text-xs text-muted">
            <div>
              <span className="block uppercase tracking-wider">Created</span>
              <span className="text-muted">
                {new Date(task.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="block uppercase tracking-wider">Updated</span>
              <span className="text-muted">
                {new Date(task.updatedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
