"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

export function AddMeasurableModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [goalDirection, setGoalDirection] = useState<"above" | "below" | "exact">("above");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");

  const createMeasurable = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId: string;
      goalValue: number;
      goalDirection: string;
      unit?: string;
    }) => {
      const res = await fetch("/api/measurables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create measurable");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard"] });
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

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!ownerId) {
      setError("Please select an owner");
      return;
    }

    const numGoal = parseFloat(goalValue);
    if (isNaN(numGoal)) {
      setError("Goal value must be a number");
      return;
    }

    createMeasurable.mutate(
      {
        title,
        description: description || undefined,
        ownerId,
        goalValue: numGoal,
        goalDirection,
        unit: unit || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setOwnerId("");
          setGoalValue("");
          setUnit("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Add Measurable
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Add a new weekly metric to your scorecard
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
              Metric Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="e.g., Weekly enrolments"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="Brief description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Owner
            </label>
            <select
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              <option value="">Select person...</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Goal
              </label>
              <input
                type="number"
                required
                step="any"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direction
              </label>
              <select
                value={goalDirection}
                onChange={(e) =>
                  setGoalDirection(e.target.value as "above" | "below" | "exact")
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="above">≥ Above</option>
                <option value="below">≤ Below</option>
                <option value="exact">= Exact</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">None</option>
                <option value="$">$ Dollar</option>
                <option value="%">% Percent</option>
                <option value="count"># Count</option>
                <option value="score">Score</option>
              </select>
            </div>
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
              disabled={createMeasurable.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createMeasurable.isPending ? "Adding..." : "Add Measurable"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
