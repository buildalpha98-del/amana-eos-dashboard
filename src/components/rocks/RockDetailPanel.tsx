"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRock, useUpdateRock, useDeleteRock } from "@/hooks/useRocks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateAU, getWeekStart } from "@/lib/utils";
import {
  X,
  CheckSquare,
  AlertCircle,
  Flag,
  User,
  Target,
  Trash2,
  Save,
  Plus,
  Search,
  Link,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import type { RockStatus, RockPriority, RockType } from "@prisma/client";

const statusOptions: { value: RockStatus; label: string; color: string }[] = [
  { value: "on_track", label: "On Track", color: "#10B981" },
  { value: "off_track", label: "Off Track", color: "#EF4444" },
  { value: "complete", label: "Complete", color: "#004E64" },
  { value: "dropped", label: "Dropped", color: "#9CA3AF" },
];

const priorityOptions: { value: RockPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "#EF4444" },
  { value: "high", label: "High", color: "#F59E0B" },
  { value: "medium", label: "Medium", color: "#3B82F6" },
];

export function RockDetailPanel({
  open,
  rockId,
  onClose,
}: {
  open: boolean;
  rockId: string;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const { data: rock, isLoading } = useRock(rockId);
  const updateRock = useUpdateRock();
  const deleteRock = useDeleteRock();
  const queryClient = useQueryClient();
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state when rock data loads or changes
  useEffect(() => {
    if (rock) {
      setTitle(rock.title);
      setDescription(rock.description || "");
    }
  }, [rock]);

  // ── Milestone state & mutations ──
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDue, setNewMilestoneDue] = useState("");

  const addMilestone = useMutation({
    mutationFn: async (data: { title: string; dueDate: string }) => {
      const res = await fetch(`/api/rocks/${rockId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add milestone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      setNewMilestoneTitle("");
      setNewMilestoneDue("");
      setShowAddMilestone(false);
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error("Failed to update milestone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
    },
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete milestone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
    },
  });

  // ── Linked To-Do state & mutations ──
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoDue, setNewTodoDue] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");

  const addLinkedTodo = useMutation({
    mutationFn: async (data: {
      title: string;
      assigneeId: string;
      dueDate: string;
      weekOf: string;
      rockId: string;
    }) => {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create linked to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTodoTitle("");
      setNewTodoDue("");
      setNewTodoAssignee("");
      setShowAddTodo(false);
    },
  });

  const toggleTodoStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const unlinkTodo = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId: null }),
      });
      if (!res.ok) throw new Error("Failed to unlink to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  // ── Linked Issue state & mutations ──
  const [showAddIssue, setShowAddIssue] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssuePriority, setNewIssuePriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const addLinkedIssue = useMutation({
    mutationFn: async (data: {
      title: string;
      priority: string;
      rockId: string;
    }) => {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create linked issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setNewIssueTitle("");
      setNewIssuePriority("medium");
      setShowAddIssue(false);
    },
  });

  const unlinkIssue = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId: null }),
      });
      if (!res.ok) throw new Error("Failed to unlink issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  // ── Link Existing Issue state & logic ──
  const [showLinkIssue, setShowLinkIssue] = useState(false);
  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false);
  const issueSearchRef = useRef<HTMLDivElement>(null);

  // Fetch unlinked issues (no rockId) for the search dropdown
  const { data: unlinkedIssues, isLoading: isLoadingUnlinked } = useQuery<
    {
      id: string;
      title: string;
      priority: string;
      status: string;
      raisedBy: { name: string };
    }[]
  >({
    queryKey: ["issues-unlinked"],
    queryFn: async () => {
      const res = await fetch("/api/issues");
      if (!res.ok) return [];
      const data = await res.json();
      // Filter to open/in_discussion issues with no rockId (unlinked)
      const issues = Array.isArray(data) ? data : data.items || [];
      return issues.filter(
        (issue: { rockId: string | null; status: string }) =>
          !issue.rockId &&
          (issue.status === "open" || issue.status === "in_discussion")
      );
    },
    enabled: showLinkIssue,
    staleTime: 30_000,
  });

  const linkExistingIssue = useMutation({
    mutationFn: async (issueId: string) => {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rockId }),
      });
      if (!res.ok) throw new Error("Failed to link issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rock", rockId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issues-unlinked"] });
      setIssueSearchQuery("");
      setIssueDropdownOpen(false);
      setShowLinkIssue(false);
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (issueSearchRef.current && !issueSearchRef.current.contains(e.target as Node)) {
        setIssueDropdownOpen(false);
      }
    }
    if (issueDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [issueDropdownOpen]);

  if (isLoading) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent>
          <SheetTitle className="sr-only">Rock Details</SheetTitle>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-6 h-6 border-2 border-brand border-t-transparent rounded-full" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!rock) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent>
          <SheetTitle className="sr-only">Rock Details</SheetTitle>
          <p className="text-muted text-center py-12">Rock not found</p>
        </SheetContent>
      </Sheet>
    );
  }

  const handleSave = () => {
    updateRock.mutate(
      { id: rock.id, title, description },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    deleteRock.mutate(rock.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
      },
    });
  };

  const handleStatusChange = (status: RockStatus) => {
    updateRock.mutate({
      id: rock.id,
      status,
      ...(status === "complete" ? { percentComplete: 100 } : {}),
    });
  };

  const handleProgressChange = (percentComplete: number) => {
    updateRock.mutate({ id: rock.id, percentComplete });
  };

  const getDefaultDueDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent>
        <SheetTitle className="sr-only">Rock Details</SheetTitle>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-lg font-semibold text-foreground border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-foreground cursor-pointer hover:text-brand"
                onClick={() => {
                  setTitle(rock.title);
                  setDescription(rock.description || "");
                  setEditing(true);
                }}
              >
                {rock.title}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted">{rock.quarter}</span>
              {rock.oneYearGoal && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-xs text-brand">
                    {rock.oneYearGoal.title}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateRock.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-sm text-muted hover:bg-surface rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-6 overflow-y-auto flex-1">
        {/* Status + Priority Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                    rock.status === opt.value
                      ? "text-white border-transparent"
                      : "text-muted border-border hover:border-border"
                  )}
                  style={
                    rock.status === opt.value
                      ? { backgroundColor: opt.color }
                      : {}
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Priority
            </label>
            <div className="flex flex-wrap gap-1.5">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    updateRock.mutate({ id: rock.id, priority: opt.value })
                  }
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                    rock.priority === opt.value
                      ? "text-white border-transparent"
                      : "text-muted border-border hover:border-border"
                  )}
                  style={
                    rock.priority === opt.value
                      ? { backgroundColor: opt.color }
                      : {}
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress Slider */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Progress — {rock.percentComplete}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={rock.percentComplete}
            onChange={(e) => handleProgressChange(Number(e.target.value))}
            className="w-full h-2 bg-surface rounded-full appearance-none cursor-pointer accent-brand"
          />
        </div>

        {/* Owner */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            <User className="w-3.5 h-3.5 inline mr-1" />
            Owner
          </label>
          <select
            value={rock.ownerId}
            onChange={(e) =>
              updateRock.mutate({ id: rock.id, ownerId: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Rock Type */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Rock Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => updateRock.mutate({ id: rock.id, rockType: "company" as RockType })}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                rock.rockType === "company"
                  ? "bg-brand text-white border-brand"
                  : "text-muted border-border hover:border-border"
              )}
            >
              Company Rock
            </button>
            <button
              onClick={() => updateRock.mutate({ id: rock.id, rockType: "personal" as RockType })}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                rock.rockType === "personal"
                  ? "bg-brand text-white border-brand"
                  : "text-muted border-border hover:border-border"
              )}
            >
              Personal Rock
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Description
          </label>
          {editing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              placeholder="Describe the Rock in detail..."
            />
          ) : (
            <p
              className="text-sm text-muted whitespace-pre-wrap cursor-pointer hover:bg-surface rounded-lg p-2 -mx-2"
              onClick={() => {
                setTitle(rock.title);
                setDescription(rock.description || "");
                setEditing(true);
              }}
            >
              {rock.description || (
                <span className="text-muted italic">
                  Click to add a description...
                </span>
              )}
            </p>
          )}
        </div>

        {/* Milestones */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider">
              <Flag className="w-3.5 h-3.5 inline mr-1" />
              Milestones ({rock.milestones?.length || 0})
            </label>
            <button
              onClick={() => setShowAddMilestone(!showAddMilestone)}
              className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-0.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {showAddMilestone && (
            <div className="flex items-end gap-2 mb-3 p-2 bg-surface/50 rounded-lg">
              <div className="flex-1">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Milestone title..."
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <input
                type="date"
                value={newMilestoneDue}
                onChange={(e) => setNewMilestoneDue(e.target.value)}
                className="px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                onClick={() => {
                  if (newMilestoneTitle.trim() && newMilestoneDue)
                    addMilestone.mutate({ title: newMilestoneTitle.trim(), dueDate: newMilestoneDue });
                }}
                disabled={!newMilestoneTitle.trim() || !newMilestoneDue || addMilestone.isPending}
                className="px-3 py-1.5 text-sm bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
              >
                {addMilestone.isPending ? "..." : "Add"}
              </button>
            </div>
          )}

          {rock.milestones && rock.milestones.length > 0 ? (
            <div className="space-y-1">
              {rock.milestones.map(
                (m: {
                  id: string;
                  title: string;
                  dueDate: string;
                  completed: boolean;
                }) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-surface group"
                  >
                    <button
                      onClick={() => toggleMilestone.mutate({ id: m.id, completed: !m.completed })}
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        m.completed
                          ? "border-brand bg-brand"
                          : "border-border hover:border-brand"
                      )}
                    >
                      {m.completed && (
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={cn(
                        "text-sm flex-1",
                        m.completed ? "text-muted line-through" : "text-foreground/80"
                      )}
                    >
                      {m.title}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDateAU(m.dueDate)}
                    </span>
                    <button
                      onClick={() => deleteMilestone.mutate(m.id)}
                      disabled={deleteMilestone.isPending}
                      className="md:opacity-0 md:group-hover:opacity-100 opacity-60 p-0.5 text-muted/50 hover:text-red-500 transition-all disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          ) : (
            !showAddMilestone && (
              <p className="text-sm text-muted italic">
                No milestones yet — add milestones to track progress
              </p>
            )
          )}
        </div>

        {/* ── Linked To-Dos ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider">
              <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
              Linked To-Dos ({rock.todos?.length || 0})
            </label>
            <button
              onClick={() => {
                setShowAddTodo(!showAddTodo);
                if (!newTodoAssignee && session?.user?.id) {
                  setNewTodoAssignee(session.user.id);
                }
              }}
              className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-0.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {showAddTodo && (
            <div className="space-y-2 mb-3 p-3 bg-surface/50 rounded-lg">
              <input
                type="text"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="To-do title..."
                className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex gap-2">
                <select
                  value={newTodoAssignee}
                  onChange={(e) => setNewTodoAssignee(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">Assignee...</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newTodoDue || getDefaultDueDate()}
                  onChange={(e) => setNewTodoDue(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const dueDate = newTodoDue || getDefaultDueDate();
                    if (newTodoTitle.trim() && newTodoAssignee && dueDate) {
                      const dueDateObj = new Date(dueDate);
                      const weekOf = getWeekStart(dueDateObj).toISOString().split("T")[0];
                      addLinkedTodo.mutate({
                        title: newTodoTitle.trim(),
                        assigneeId: newTodoAssignee,
                        dueDate,
                        weekOf,
                        rockId,
                      });
                    }
                  }}
                  disabled={!newTodoTitle.trim() || !newTodoAssignee || addLinkedTodo.isPending}
                  className="px-3 py-1.5 text-sm bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
                >
                  {addLinkedTodo.isPending ? "..." : "Add To-Do"}
                </button>
                <button
                  onClick={() => setShowAddTodo(false)}
                  className="px-3 py-1.5 text-sm text-muted hover:bg-surface rounded-md"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {rock.todos && rock.todos.length > 0 ? (
            <div className="space-y-1">
              {rock.todos.map(
                (todo: {
                  id: string;
                  title: string;
                  status: string;
                  assignee: { name: string } | null;
                }) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-surface group"
                  >
                    <button
                      onClick={() =>
                        toggleTodoStatus.mutate({
                          id: todo.id,
                          status: todo.status === "complete" ? "pending" : "complete",
                        })
                      }
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        todo.status === "complete"
                          ? "border-brand bg-brand"
                          : "border-border hover:border-brand"
                      )}
                    >
                      {todo.status === "complete" && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={cn(
                        "text-sm flex-1",
                        todo.status === "complete"
                          ? "text-muted line-through"
                          : "text-foreground/80"
                      )}
                    >
                      {todo.title}
                    </span>
                    <span className="text-xs text-muted">
                      {todo.assignee?.name ?? "Unassigned"}
                    </span>
                    <button
                      onClick={() => unlinkTodo.mutate(todo.id)}
                      disabled={unlinkTodo.isPending}
                      title="Unlink from rock"
                      className="md:opacity-0 md:group-hover:opacity-100 opacity-60 p-0.5 text-muted/50 hover:text-red-500 transition-all disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          ) : (
            !showAddTodo && (
              <p className="text-sm text-muted italic">
                No linked To-Dos yet — add to-dos to break this rock down
              </p>
            )
          )}
        </div>

        {/* ── Linked Issues ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
              Linked Issues ({rock.issues?.length || 0})
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowLinkIssue(!showLinkIssue);
                  setShowAddIssue(false);
                  setIssueSearchQuery("");
                }}
                className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-0.5"
              >
                <Link className="w-3.5 h-3.5" />
                Link Existing
              </button>
              <button
                onClick={() => {
                  setShowAddIssue(!showAddIssue);
                  setShowLinkIssue(false);
                }}
                className="text-xs text-brand hover:text-brand-hover font-medium flex items-center gap-0.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
            </div>
          </div>

          {/* Link Existing Issue search */}
          {showLinkIssue && (
            <div ref={issueSearchRef} className="mb-3 p-3 bg-surface/50 rounded-lg">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={issueSearchQuery}
                  onChange={(e) => {
                    setIssueSearchQuery(e.target.value);
                    setIssueDropdownOpen(true);
                  }}
                  onFocus={() => setIssueDropdownOpen(true)}
                  placeholder="Search unlinked issues..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                  autoFocus
                />
              </div>
              {issueDropdownOpen && (
                <div className="mt-1 max-h-48 overflow-y-auto border border-border rounded-md bg-card shadow-sm">
                  {isLoadingUnlinked ? (
                    <div className="px-3 py-2 text-sm text-muted text-center">
                      Searching...
                    </div>
                  ) : unlinkedIssues && unlinkedIssues.filter(i => !issueSearchQuery || i.title.toLowerCase().includes(issueSearchQuery.toLowerCase())).length > 0 ? (
                    unlinkedIssues.filter(i => !issueSearchQuery || i.title.toLowerCase().includes(issueSearchQuery.toLowerCase())).map((issue) => (
                      <button
                        key={issue.id}
                        onClick={() => linkExistingIssue.mutate(issue.id)}
                        disabled={linkExistingIssue.isPending}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-brand/5 flex items-center gap-2 border-b border-border/50 last:border-0 disabled:opacity-50"
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            issue.priority === "critical"
                              ? "bg-red-500"
                              : issue.priority === "high"
                              ? "bg-amber-500"
                              : issue.priority === "medium"
                              ? "bg-blue-500"
                              : "bg-muted"
                          )}
                        />
                        <span className="flex-1 truncate text-foreground/80">
                          {issue.title}
                        </span>
                        <span className="text-xs text-muted flex-shrink-0">
                          {issue.status.replace("_", " ")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted text-center">
                      {issueSearchQuery
                        ? "No unlinked issues match your search"
                        : "No unlinked open issues available"}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    setShowLinkIssue(false);
                    setIssueSearchQuery("");
                    setIssueDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 text-sm text-muted hover:bg-surface rounded-md"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showAddIssue && (
            <div className="space-y-2 mb-3 p-3 bg-surface/50 rounded-lg">
              <input
                type="text"
                value={newIssueTitle}
                onChange={(e) => setNewIssueTitle(e.target.value)}
                placeholder="Issue title..."
                className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex gap-2">
                <select
                  value={newIssuePriority}
                  onChange={(e) => setNewIssuePriority(e.target.value as typeof newIssuePriority)}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button
                  onClick={() => {
                    if (newIssueTitle.trim()) {
                      addLinkedIssue.mutate({
                        title: newIssueTitle.trim(),
                        priority: newIssuePriority,
                        rockId,
                      });
                    }
                  }}
                  disabled={!newIssueTitle.trim() || addLinkedIssue.isPending}
                  className="px-3 py-1.5 text-sm bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
                >
                  {addLinkedIssue.isPending ? "..." : "Add Issue"}
                </button>
                <button
                  onClick={() => setShowAddIssue(false)}
                  className="px-3 py-1.5 text-sm text-muted hover:bg-surface rounded-md"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {rock.issues && rock.issues.length > 0 ? (
            <div className="space-y-1">
              {rock.issues.map(
                (issue: {
                  id: string;
                  title: string;
                  status: string;
                  priority: string;
                }) => (
                  <div
                    key={issue.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-surface group"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        issue.priority === "critical"
                          ? "bg-red-500"
                          : issue.priority === "high"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      )}
                    />
                    <span className="text-sm text-foreground/80 flex-1">
                      {issue.title}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        issue.status === "solved"
                          ? "bg-green-50 text-green-600"
                          : "bg-surface text-muted"
                      )}
                    >
                      {issue.status.replace("_", " ")}
                    </span>
                    <button
                      onClick={() => unlinkIssue.mutate(issue.id)}
                      disabled={unlinkIssue.isPending}
                      title="Unlink from rock"
                      className="md:opacity-0 md:group-hover:opacity-100 opacity-60 p-0.5 text-muted/50 hover:text-red-500 transition-all disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          ) : (
            !showAddIssue && !showLinkIssue && (
              <p className="text-sm text-muted italic">
                No linked Issues yet — report issues blocking this rock
              </p>
            )
          )}
        </div>

        {/* Delete */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Rock
          </button>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete Rock"
          description="Are you sure you want to delete this rock? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          loading={deleteRock.isPending}
        />
      </div>
      </SheetContent>
    </Sheet>
  );
}
