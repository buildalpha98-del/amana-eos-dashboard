"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { MeasurableData } from "@/hooks/useScorecard";

interface UserOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
}

export function AddMeasurableModal({
  open,
  onClose,
  editingMeasurable,
}: {
  open: boolean;
  onClose: () => void;
  editingMeasurable?: MeasurableData | null;
}) {
  const queryClient = useQueryClient();
  const isEditMode = !!editingMeasurable;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [goalDirection, setGoalDirection] = useState<"above" | "below" | "exact">("above");
  const [unit, setUnit] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [error, setError] = useState("");

  // Pre-fill form when editing
  useEffect(() => {
    if (editingMeasurable) {
      setTitle(editingMeasurable.title);
      setDescription(editingMeasurable.description || "");
      setOwnerId(editingMeasurable.ownerId);
      setGoalValue(String(editingMeasurable.goalValue));
      setGoalDirection(editingMeasurable.goalDirection);
      setUnit(editingMeasurable.unit || "");
      setServiceId(editingMeasurable.serviceId || "");
    } else {
      setTitle("");
      setDescription("");
      setOwnerId("");
      setGoalValue("");
      setGoalDirection("above");
      setUnit("");
      setServiceId("");
    }
    setError("");
  }, [editingMeasurable, open]);

  const createMeasurable = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId: string;
      goalValue: number;
      goalDirection: string;
      unit?: string;
      serviceId?: string;
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

  const updateMeasurable = useMutation({
    mutationFn: async (data: {
      id: string;
      title?: string;
      description?: string | null;
      ownerId?: string;
      goalValue?: number;
      goalDirection?: string;
      unit?: string | null;
      serviceId?: string | null;
    }) => {
      const { id, ...body } = data;
      const res = await fetch(`/api/measurables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update measurable");
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

  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
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

    if (isEditMode && editingMeasurable) {
      updateMeasurable.mutate(
        {
          id: editingMeasurable.id,
          title,
          description: description || null,
          ownerId,
          goalValue: numGoal,
          goalDirection,
          unit: unit || null,
          serviceId: serviceId || null,
        },
        {
          onSuccess: () => onClose(),
          onError: (err: Error) => setError(err.message),
        }
      );
    } else {
      createMeasurable.mutate(
        {
          title,
          description: description || undefined,
          ownerId,
          goalValue: numGoal,
          goalDirection,
          unit: unit || undefined,
          serviceId: serviceId || undefined,
        },
        {
          onSuccess: () => {
            setTitle("");
            setDescription("");
            setOwnerId("");
            setGoalValue("");
            setUnit("");
            setServiceId("");
            onClose();
          },
          onError: (err: Error) => setError(err.message),
        }
      );
    }
  };

  const isPending = isEditMode ? updateMeasurable.isPending : createMeasurable.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isEditMode ? "Edit Measurable" : "Add Measurable"}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode
                ? "Update this metric on your scorecard"
                : "Add a new weekly metric to your scorecard"}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select person...</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Centre{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">All centres (global)</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="above">{"\u2265"} Above</option>
                <option value="below">{"\u2264"} Below</option>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {isPending
                ? isEditMode
                  ? "Saving..."
                  : "Adding..."
                : isEditMode
                ? "Save Changes"
                : "Add Measurable"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
