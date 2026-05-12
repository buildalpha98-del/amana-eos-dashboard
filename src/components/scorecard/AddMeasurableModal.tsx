"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { fetchApi } from "@/lib/fetch-api";
import type { MeasurableData } from "@/hooks/useScorecard";
import {
  useScorecardMembers,
  type ScorecardSummary,
} from "@/hooks/useScorecards";

interface UserOption {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
}

/**
 * Stage 3 of Bucket O. The modal:
 *   - takes a `scorecardId` (required for create)
 *   - drops the "Select Centre" field (scope is the scorecard now)
 *   - restricts the owner picker to scorecard owner + members
 *     (rejects "tried to set owner to someone not in this scorecard")
 */
export function AddMeasurableModal({
  open,
  onClose,
  editingMeasurable,
  scorecardId,
  scorecardOwner,
}: {
  open: boolean;
  onClose: () => void;
  editingMeasurable?: MeasurableData | null;
  /** Target scorecard for new measurables — required for create. */
  scorecardId?: string;
  /** Used to include the scorecard's own owner in the picker. */
  scorecardOwner?: ScorecardSummary["owner"];
}) {
  const queryClient = useQueryClient();
  const isEditMode = !!editingMeasurable;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [goalDirection, setGoalDirection] = useState<"above" | "below" | "exact">("above");
  const [unit, setUnit] = useState("");
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
    } else {
      setTitle("");
      setDescription("");
      setOwnerId("");
      setGoalValue("");
      setGoalDirection("above");
      setUnit("");
    }
    setError("");
  }, [editingMeasurable, open]);

  const createMeasurable = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId: string;
      scorecardId: string;
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
      queryClient.invalidateQueries({ queryKey: ["scorecard-detail"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      queryClient.invalidateQueries({ queryKey: ["scorecard-detail"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  // Scorecard members — restrict the owner picker to people who can
  // actually own a measurable in this scorecard. Owner is implicitly
  // a participant and is added below.
  const members = useScorecardMembers(open ? scorecardId ?? null : null);
  const allUsers = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users"),
    enabled: open,
  });

  // Build the owner picker list: scorecard owner first, then members.
  // Falls back to the full user list if scorecardId isn't set (e.g.
  // legacy callers that haven't migrated yet).
  const ownerCandidates: UserOption[] = scorecardId
    ? [
        ...(scorecardOwner
          ? [
              {
                id: scorecardOwner.id,
                name: `${scorecardOwner.name} (owner)`,
                email: scorecardOwner.email,
                avatar: scorecardOwner.avatar,
              },
            ]
          : []),
        ...(members.data?.members ?? []).map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatar: m.user.avatar,
        })),
      ]
    : allUsers.data ?? [];

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
        },
        {
          onSuccess: () => onClose(),
          onError: (err: Error) => setError(err.message),
        }
      );
    } else {
      if (!scorecardId) {
        setError("Select a scorecard first");
        return;
      }
      createMeasurable.mutate(
        {
          title,
          description: description || undefined,
          ownerId,
          scorecardId,
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
    }
  };

  const isPending = isEditMode ? updateMeasurable.isPending : createMeasurable.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {isEditMode ? "Edit Measurable" : "Add Measurable"}
            </h3>
            <p className="text-sm text-muted mt-0.5">
              {isEditMode
                ? "Update this metric on your scorecard"
                : "Add a new weekly metric to your scorecard"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
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
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Metric Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="e.g., Weekly enrolments"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Description{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="Brief description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Owner
            </label>
            <select
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-testid="measurable-owner-picker"
            >
              <option value="">
                {scorecardId && ownerCandidates.length === 0
                  ? "No members yet — invite someone first"
                  : "Select person…"}
              </option>
              {ownerCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {scorecardId ? (
              <p className="mt-1 text-xs text-muted">
                Only scorecard members can own a measurable. Invite a
                person from the scorecard&apos;s Members button to add
                them here.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Goal
              </label>
              <input
                type="number"
                required
                step="any"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Direction
              </label>
              <select
                value={goalDirection}
                onChange={(e) =>
                  setGoalDirection(e.target.value as "above" | "below" | "exact")
                }
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                <option value="above">{"\u2265"} Above</option>
                <option value="below">{"\u2264"} Below</option>
                <option value="exact">= Exact</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
              className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface transition-colors"
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
