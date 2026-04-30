"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, getWeekStart } from "@/lib/utils";
import { AlertCircle, Plus, X, ArrowRight, CheckSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { useServiceMembers } from "@/hooks/useServiceMembers";

interface IssueData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  raisedBy: { id: string; name: string };
  _count: { spawnedTodos: number };
  createdAt: string;
}

interface UserOption {
  id: string;
  name: string;
}

const priorityFilters = ["all", "critical", "high", "medium", "low"] as const;

const priorityConfig: Record<string, { label: string; dot: string }> = {
  critical: { label: "Critical", dot: "bg-red-500" },
  high: { label: "High", dot: "bg-orange-500" },
  medium: { label: "Medium", dot: "bg-yellow-500" },
  low: { label: "Low", dot: "bg-blue-500" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-amber-100 text-amber-700 border-amber-300" },
  in_discussion: { label: "In Discussion", color: "bg-blue-100 text-blue-700 border-blue-300" },
  solved: { label: "Solved", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

function getNextIssueStatus(current: string): string {
  if (current === "open") return "in_discussion";
  if (current === "in_discussion") return "solved";
  if (current === "solved") return "closed";
  return current;
}

const statusFilters = ["all", "open", "in_discussion", "solved", "closed"] as const;

export function ServiceIssuesTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    ownerId: "",
  });

  const { data: issues = [], isLoading } = useQuery<IssueData[]>({
    queryKey: ["issues", { serviceId }],
    queryFn: async () => {
      const res = await fetch(`/api/issues?serviceId=${serviceId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // 2026-04-30: scope owner picker to service members + State Manager so
  // service-level issues can be escalated up the chain (per training-session
  // feedback). Owner / Admin remain reachable via the cross-service
  // /issues page.
  const { data: users = [] } = useServiceMembers(serviceId, {
    includeStateManagers: true,
  });

  const createIssue = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues", { serviceId }] });
      setShowModal(false);
      setFormData({ title: "", description: "", priority: "medium", ownerId: "" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues", { serviceId }] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const createTodoFromIssue = useMutation({
    mutationFn: async ({ issueId, title, ownerId }: { issueId: string; title: string; ownerId: string | null }) => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Default: 1 week from now
      const dueDateStr = dueDate.toISOString().split("T")[0];
      const weekOf = getWeekStart(dueDate).toISOString();
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Issue] ${title}`,
          serviceId,
          issueId,
          assigneeId: ownerId || (users.length > 0 ? users[0].id : null),
          dueDate: dueDateStr,
          weekOf,
        }),
      });
      if (!res.ok) throw new Error("Failed to create to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos", { serviceId }] });
      queryClient.invalidateQueries({ queryKey: ["issues", { serviceId }] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const filteredIssues = useMemo(() => {
    let list = issues;
    if (priorityFilter !== "all") list = list.filter((i) => i.priority === priorityFilter);
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    return list;
  }, [issues, priorityFilter, statusFilter]);

  function handleCreate() {
    if (!formData.title) return;
    createIssue.mutate({
      title: formData.title,
      description: formData.description || null,
      priority: formData.priority,
      ownerId: formData.ownerId || null,
      serviceId,
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-brand" />
          Service Issues
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {statusFilters.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All Statuses" : statusConfig[f]?.label || f}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {priorityFilters.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All Priorities" : priorityConfig[f]?.label || f}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Raise Issue
          </button>
        </div>
      </div>

      {/* Issues List */}
      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-surface/50 rounded-lg">
              <Skeleton className="w-2.5 h-2.5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted">
          No issues found.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredIssues.map((issue) => {
            const nextStatus = getNextIssueStatus(issue.status);
            const canAdvance = nextStatus !== issue.status;

            return (
              <div
                key={issue.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-surface/50 rounded-lg hover:bg-surface transition-colors"
              >
                {/* Priority Dot */}
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full flex-shrink-0",
                    priorityConfig[issue.priority]?.dot || "bg-border"
                  )}
                />

                {/* Title */}
                <span className="flex-1 text-sm text-foreground/80 truncate">
                  {issue.title}
                </span>

                {/* Status Badge */}
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap",
                    statusConfig[issue.status]?.color || "bg-gray-100 text-gray-500 border-gray-300"
                  )}
                >
                  {statusConfig[issue.status]?.label || issue.status}
                </span>

                {/* Owner */}
                <span className="text-xs text-muted whitespace-nowrap min-w-[80px] text-right">
                  {issue.owner?.name || "Unassigned"}
                </span>

                {/* Spawned Todos Count */}
                {issue._count.spawnedTodos > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-brand/10 text-brand rounded whitespace-nowrap">
                    {issue._count.spawnedTodos} to-do{issue._count.spawnedTodos !== 1 ? "s" : ""}
                  </span>
                )}

                {/* Create Todo from Issue */}
                {issue.status !== "closed" && (
                  <button
                    onClick={() =>
                      createTodoFromIssue.mutate({
                        issueId: issue.id,
                        title: issue.title,
                        ownerId: issue.ownerId,
                      })
                    }
                    disabled={createTodoFromIssue.isPending}
                    className="flex items-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap"
                    title="Create a to-do from this issue"
                  >
                    <CheckSquare className="w-3 h-3" />
                    To-Do
                  </button>
                )}

                {/* Advance Status Button */}
                {canAdvance && (
                  <button
                    onClick={() =>
                      updateStatus.mutate({ id: issue.id, status: nextStatus })
                    }
                    disabled={updateStatus.isPending}
                    className="flex items-center gap-0.5 text-[10px] text-brand hover:text-brand/80 font-medium whitespace-nowrap"
                    title={`Move to ${statusConfig[nextStatus]?.label || nextStatus}`}
                  >
                    <ArrowRight className="w-3 h-3" />
                    {statusConfig[nextStatus]?.label || nextStatus}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Raise Issue Modal */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Raise Issue
                </h4>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-muted hover:text-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, title: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="Describe the issue..."
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                    placeholder="Additional context..."
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, priority: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                {/* Owner */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Owner
                  </label>
                  <select
                    value={formData.ownerId}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, ownerId: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="text-xs px-4 py-2 text-muted hover:text-foreground/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formData.title || createIssue.isPending}
                  className={cn(
                    "text-xs px-4 py-2 rounded-lg font-medium transition-colors",
                    formData.title
                      ? "bg-brand text-white hover:bg-brand/90"
                      : "bg-surface text-muted cursor-not-allowed"
                  )}
                >
                  {createIssue.isPending ? "Creating..." : "Raise Issue"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
