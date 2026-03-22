"use client";

import { useState, useEffect } from "react";
import { useUpdateTodo, useDeleteTodo, type TodoData } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { X, Mountain, AlertCircle, Lock, Unlock, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import type { TodoStatus } from "@prisma/client";

interface UserOption {
  id: string;
  name: string;
}
interface RockOption {
  id: string;
  title: string;
}

const statusOptions: { value: TodoStatus; label: string; color: string }[] = [
  { value: "pending", label: "Pending", color: "bg-surface text-foreground/80" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
];

export function TodoDetailPanel({
  open,
  todo,
  onClose,
}: {
  open: boolean;
  todo: TodoData;
  onClose: () => void;
}) {
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description || "");
  const [assigneeId, setAssigneeId] = useState(todo.assigneeId);
  const [dueDate, setDueDate] = useState(
    new Date(todo.dueDate).toISOString().split("T")[0]
  );
  const [status, setStatus] = useState<TodoStatus>(todo.status);
  const [rockId, setRockId] = useState(todo.rockId || "");
  const [isPrivate, setIsPrivate] = useState(todo.isPrivate);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset when todo changes
  useEffect(() => {
    setTitle(todo.title);
    setDescription(todo.description || "");
    setAssigneeId(todo.assigneeId);
    setDueDate(new Date(todo.dueDate).toISOString().split("T")[0]);
    setStatus(todo.status);
    setRockId(todo.rockId || "");
    setIsPrivate(todo.isPrivate);
    setShowDeleteConfirm(false);
  }, [todo]);

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rocks } = useQuery<RockOption[]>({
    queryKey: ["rocks-list-active"],
    queryFn: async () => {
      const res = await fetch("/api/rocks");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: RockOption) => ({ id: r.id, title: r.title }));
    },
  });

  const saveField = (field: string, value: unknown) => {
    updateTodo.mutate({ id: todo.id, [field]: value });
  };

  const handleDelete = () => {
    deleteTodo.mutate(todo.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent width="max-w-md">
        <SheetTitle className="sr-only">To-Do Detail</SheetTitle>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">To-Do Detail</h3>
            {isPrivate && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                <Lock className="w-3 h-3" />
                Private
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-5">
          {/* Title (inline edit) */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title !== todo.title && title.trim()) saveField("title", title);
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== (todo.description || ""))
                  saveField("description", description || null);
              }}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
              placeholder="Add details..."
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-muted mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setStatus(opt.value);
                    saveField("status", opt.value);
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                    status === opt.value
                      ? opt.color + " ring-2 ring-offset-1 ring-border"
                      : "bg-surface/50 text-muted hover:bg-surface"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => {
                  setAssigneeId(e.target.value);
                  saveField("assigneeId", e.target.value);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="" disabled>Select assignee</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  saveField("dueDate", e.target.value);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Linked Rock */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              <Mountain className="w-3 h-3 inline mr-1" />
              Linked Rock
            </label>
            <select
              value={rockId}
              onChange={(e) => {
                setRockId(e.target.value);
                saveField("rockId", e.target.value || null);
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">No linked Rock</option>
              {rocks?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Linked Issue (read-only) */}
          {todo.issue && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Linked Issue
              </label>
              <p className="text-sm text-foreground/80 bg-surface/50 px-3 py-2 rounded-lg">
                {todo.issue.title}
              </p>
            </div>
          )}

          {/* Private Toggle */}
          <div className="flex items-center justify-between py-3 px-3 bg-surface/50 rounded-lg">
            <div className="flex items-center gap-2">
              {isPrivate ? (
                <Lock className="w-4 h-4 text-amber-600" />
              ) : (
                <Unlock className="w-4 h-4 text-muted" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground/80">
                  {isPrivate ? "Private To-Do" : "Public To-Do"}
                </p>
                <p className="text-xs text-muted">
                  {isPrivate
                    ? "Only visible to you and admins"
                    : "Visible to all team members"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const next = !isPrivate;
                setIsPrivate(next);
                saveField("isPrivate", next);
              }}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isPrivate ? "bg-amber-500" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  isPrivate ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {/* Meta info */}
          <div className="text-xs text-muted space-y-0.5 pt-2 border-t border-border/50">
            <p>
              Created{" "}
              {new Date(todo.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            <p>
              Last updated{" "}
              {new Date(todo.updatedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Footer - Delete */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete To-Do
          </button>
        </div>

        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete To-Do"
          description="Are you sure you want to delete this to-do? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          loading={deleteTodo.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}
