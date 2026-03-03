"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertCircle, Plus, X, ArrowRight } from "lucide-react";

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

export function ServiceIssuesTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
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

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
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
  });

  const filteredIssues = priorityFilter === "all"
    ? issues
    : issues.filter((i) => i.priority === priorityFilter);

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
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-[#004E64]" />
          Service Issues
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#004E64]"
          >
            {priorityFilters.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All" : priorityConfig[f]?.label || f}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-[#004E64] text-white rounded-md hover:bg-[#004E64]/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Raise Issue
          </button>
        </div>
      </div>

      {/* Issues List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
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
                className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {/* Priority Dot */}
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full flex-shrink-0",
                    priorityConfig[issue.priority]?.dot || "bg-gray-400"
                  )}
                />

                {/* Title */}
                <span className="flex-1 text-sm text-gray-700 truncate">
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
                <span className="text-xs text-gray-400 whitespace-nowrap min-w-[80px] text-right">
                  {issue.owner?.name || "Unassigned"}
                </span>

                {/* Spawned Todos Count */}
                {issue._count.spawnedTodos > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#004E64]/10 text-[#004E64] rounded whitespace-nowrap">
                    {issue._count.spawnedTodos} to-do{issue._count.spawnedTodos !== 1 ? "s" : ""}
                  </span>
                )}

                {/* Advance Status Button */}
                {canAdvance && (
                  <button
                    onClick={() =>
                      updateStatus.mutate({ id: issue.id, status: nextStatus })
                    }
                    disabled={updateStatus.isPending}
                    className="flex items-center gap-0.5 text-[10px] text-[#004E64] hover:text-[#004E64]/80 font-medium whitespace-nowrap"
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  Raise Issue
                </h4>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, title: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                    placeholder="Describe the issue..."
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
                    placeholder="Additional context..."
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, priority: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                {/* Owner */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Owner
                  </label>
                  <select
                    value={formData.ownerId}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, ownerId: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
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
                  className="text-xs px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formData.title || createIssue.isPending}
                  className={cn(
                    "text-xs px-4 py-2 rounded-lg font-medium transition-colors",
                    formData.title
                      ? "bg-[#004E64] text-white hover:bg-[#004E64]/90"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
