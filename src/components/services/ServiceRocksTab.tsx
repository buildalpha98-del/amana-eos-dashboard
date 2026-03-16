"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getCurrentQuarter } from "@/lib/utils";
import { Mountain, Plus, User, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface RockData {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: { id: string; name: string; avatar: string | null };
  quarter: string;
  status: string;
  percentComplete: number;
  priority: string;
  _count: { todos: number; issues: number; milestones: number };
}

interface UserOption {
  id: string;
  name: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  on_track: { label: "On Track", color: "bg-emerald-100 text-emerald-700" },
  off_track: { label: "Off Track", color: "bg-red-100 text-red-700" },
  complete: { label: "Complete", color: "bg-blue-100 text-blue-700" },
  dropped: { label: "Dropped", color: "bg-gray-100 text-gray-500" },
};

const statusCycle = ["on_track", "off_track", "complete", "dropped"];

const priorityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700" },
  high: { label: "High", color: "bg-orange-100 text-orange-700" },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-700" },
};

function getQuarterOptions(): string[] {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const currentYear = now.getFullYear();

  const quarters: string[] = [];
  quarters.push(`Q${currentQ}-${currentYear}`);

  const nextQ = currentQ === 4 ? 1 : currentQ + 1;
  const nextYear = currentQ === 4 ? currentYear + 1 : currentYear;
  quarters.push(`Q${nextQ}-${nextYear}`);

  return quarters;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ServiceRocksTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: rocks, isLoading } = useQuery<RockData[]>({
    queryKey: ["rocks", { serviceId }],
    queryFn: async () => {
      const res = await fetch(`/api/rocks?serviceId=${serviceId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filteredRocks = rocks?.filter((r) => r.quarter === selectedQuarter) ?? [];
  const quarterOptions = getQuarterOptions();

  const handleStatusCycle = async (rock: RockData) => {
    const currentIndex = statusCycle.indexOf(rock.status);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];

    await fetch(`/api/rocks/${rock.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    queryClient.invalidateQueries({ queryKey: ["rocks", { serviceId }] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5 text-brand" />
          <h3 className="text-base font-semibold text-gray-900">Service Rocks</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand text-gray-700"
          >
            {quarterOptions.map((q) => (
              <option key={q} value={q}>
                {q.replace("-", " ")}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rock
          </button>
        </div>
      </div>

      {/* Rock Cards Grid */}
      {filteredRocks.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl">
          <Mountain className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No rocks for {selectedQuarter.replace("-", " ")}</p>
          <p className="text-xs text-gray-400 mt-1">
            Add a rock to set quarterly priorities for this service.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRocks.map((rock) => {
            const priority = priorityConfig[rock.priority] || priorityConfig.medium;
            const status = statusConfig[rock.status] || statusConfig.on_track;

            return (
              <div
                key={rock.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                {/* Title */}
                <h4 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
                  {rock.title}
                </h4>

                {/* Owner */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
                    {rock.owner?.avatar ? (
                      <img
                        src={rock.owner?.avatar}
                        alt={rock.owner?.name ?? "Unassigned"}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-medium text-white">
                        {getInitials(rock.owner?.name ?? "Unassigned")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">{rock.owner?.name ?? "Unassigned"}</span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-3">
                  <span
                    className={cn(
                      "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                      priority.color
                    )}
                  >
                    {priority.label}
                  </span>
                  <button
                    onClick={() => handleStatusCycle(rock)}
                    className={cn(
                      "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity",
                      status.color
                    )}
                    title="Click to update status"
                  >
                    {status.label}
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Progress</span>
                    <span className="text-[10px] font-medium text-gray-700">
                      {rock.percentComplete}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all"
                      style={{ width: `${rock.percentComplete}%` }}
                    />
                  </div>
                </div>

                {/* Counts */}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <span className="text-[10px] text-gray-500">
                    <span className="font-semibold text-gray-700">{rock._count.todos}</span> to-dos
                  </span>
                  <span className="text-[10px] text-gray-500">
                    <span className="font-semibold text-gray-700">{rock._count.issues}</span> issues
                  </span>
                  <span className="text-[10px] text-gray-500">
                    <span className="font-semibold text-gray-700">{rock._count.milestones}</span>{" "}
                    milestones
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Rock Modal */}
      {showAddModal && (
        <AddRockModal
          serviceId={serviceId}
          quarter={selectedQuarter}
          users={users ?? []}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function AddRockModal({
  serviceId,
  quarter,
  users,
  onClose,
}: {
  serviceId: string;
  quarter: string;
  users: UserOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState("");

  const createRock = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/rocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create rock" }));
        throw new Error(err.error || "Failed to create rock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks", { serviceId }] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    createRock.mutate({
      title: title.trim(),
      description: description.trim() || null,
      ownerId: ownerId || undefined,
      quarter,
      priority,
      serviceId,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add Rock</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Set a quarterly priority for {quarter.replace("-", " ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="e.g., Improve NQS quality rating"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
              placeholder="Describe this rock's goal and key outcomes..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Owner
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="">Select owner...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quarter
            </label>
            <input
              type="text"
              readOnly
              value={quarter.replace("-", " ")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-500 bg-gray-50 cursor-not-allowed"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRock.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createRock.isPending ? "Adding..." : "Add Rock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
