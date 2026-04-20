"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  useCreateMarketingTask,
  useCampaigns,
} from "@/hooks/useMarketing";
import type {
  MarketingTaskPriority,
  MarketingTaskStatus,
} from "@prisma/client";

const PRIORITY_OPTIONS: { value: MarketingTaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS: { value: MarketingTaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
];

export function CreateTaskModal({
  open,
  onClose,
  defaultCampaignId,
  defaultPostId,
}: {
  open: boolean;
  onClose: () => void;
  defaultCampaignId?: string;
  defaultPostId?: string;
}) {
  const createTask = useCreateMarketingTask();
  const { data: campaigns } = useCampaigns({});
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MarketingTaskPriority>("medium");
  const [status, setStatus] = useState<MarketingTaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [campaignId, setCampaignId] = useState(defaultCampaignId || "");
  const [error, setError] = useState("");

  // Fetch users for assignee dropdown
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("CreateTaskModal: fetch users failed:", err);
      });
  }, []);

  // Reset when opened with defaults
  useEffect(() => {
    if (open) {
      setCampaignId(defaultCampaignId || "");
    }
  }, [open, defaultCampaignId]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("todo");
    setDueDate("");
    setAssigneeId("");
    setCampaignId(defaultCampaignId || "");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    createTask.mutate(
      {
        title: title.trim(),
        ...(description.trim() && { description: description.trim() }),
        priority,
        status,
        ...(dueDate && { dueDate: new Date(dueDate).toISOString() }),
        ...(assigneeId && { assigneeId }),
        ...(campaignId && { campaignId }),
        ...(defaultPostId && { postId: defaultPostId }),
      },
      {
        onSuccess: () => handleClose(),
        onError: (err) => {
          setError(
            err instanceof Error ? err.message : "Failed to create task."
          );
        },
      }
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-xl bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">New Task</h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="max-h-[70vh] overflow-y-auto px-6 py-5"
          >
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What needs to be done..."
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Priority + Status Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/80">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as MarketingTaskPriority)
                    }
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/80">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as MarketingTaskStatus)
                    }
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">None</option>
                  {(campaigns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTask.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {createTask.isPending ? "Creating..." : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
