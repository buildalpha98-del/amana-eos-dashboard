"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getWeekStart } from "@/lib/utils";
import {
  BarChart3,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  X,
} from "lucide-react";

interface MeasurableData {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: { id: string; name: string; avatar: string | null };
  goalValue: number;
  goalDirection: string;
  unit: string | null;
  frequency: string;
  entries: {
    id: string;
    weekOf: string;
    value: number;
    onTrack: boolean;
  }[];
}

interface UserOption {
  id: string;
  name: string;
}

function getTrailing13Weeks(): Date[] {
  const weeks: Date[] = [];
  const current = getWeekStart();
  for (let i = 0; i <= 12; i++) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks;
}

function formatWeekShort(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ServiceScorecardTab({ serviceId }: { serviceId: string }) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const weeks = useMemo(() => getTrailing13Weeks(), []);

  // Fetch measurables for this service
  const { data: measurables = [], isLoading } = useQuery<MeasurableData[]>({
    queryKey: ["service-scorecard", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceId}/scorecard`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch users
  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Build entry lookup: measurableId -> weekKey -> entry
  const entryLookup = useMemo(() => {
    const lookup: Record<
      string,
      Record<string, { id: string; value: number; onTrack: boolean }>
    > = {};
    for (const m of measurables) {
      lookup[m.id] = {};
      for (const e of m.entries) {
        const weekKey = new Date(e.weekOf).toISOString().split("T")[0];
        lookup[m.id][weekKey] = e;
      }
    }
    return lookup;
  }, [measurables]);

  // Create measurable mutation
  const createMeasurable = useMutation({
    mutationFn: async (data: {
      title: string;
      ownerId: string;
      goalValue: number;
      goalDirection: string;
      unit?: string;
      frequency: string;
      serviceId: string;
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
      queryClient.invalidateQueries({
        queryKey: ["service-scorecard", serviceId],
      });
    },
  });

  // Add entry mutation
  const createEntry = useMutation({
    mutationFn: async (data: {
      measurableId: string;
      weekOf: string;
      value: number;
    }) => {
      const res = await fetch(
        `/api/measurables/${data.measurableId}/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekOf: data.weekOf, value: data.value }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-scorecard", serviceId],
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-[#004E64] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#004E64]" />
          <h3 className="text-base font-semibold text-gray-900">
            Service Scorecard
          </h3>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#004E64] text-white text-xs font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Measurable
        </button>
      </div>

      {/* Empty state */}
      {measurables.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">
            No measurables yet
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Add a measurable to start tracking service KPIs weekly.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-xs font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Measurable
          </button>
        </div>
      ) : (
        /* Scorecard table */
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px]">
                  Owner
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[160px]">
                  Measurable
                </th>
                <th className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[80px]">
                  Goal
                </th>
                {weeks.map((week) => (
                  <th
                    key={week.toISOString()}
                    className={cn(
                      "px-1 py-3 text-center text-[10px] font-medium w-[70px]",
                      week.getTime() === getWeekStart().getTime()
                        ? "text-[#004E64] bg-[#004E64]/5 font-semibold"
                        : "text-gray-400"
                    )}
                  >
                    {formatWeekShort(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measurables.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                >
                  {/* Owner */}
                  <td className="sticky left-0 z-10 bg-white px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#004E64]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-medium text-[#004E64]">
                          {m.owner.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-700 truncate max-w-[90px]">
                        {m.owner.name}
                      </span>
                    </div>
                  </td>

                  {/* Measurable title */}
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                      {m.title}
                    </div>
                    {m.description && (
                      <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                        {m.description}
                      </div>
                    )}
                  </td>

                  {/* Goal */}
                  <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {m.goalDirection === "above" ? (
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                      ) : m.goalDirection === "below" ? (
                        <TrendingDown className="w-3 h-3 text-blue-500" />
                      ) : (
                        <Target className="w-3 h-3 text-gray-500" />
                      )}
                      <span className="text-xs text-gray-600 font-medium">
                        {m.unit === "$"
                          ? `$${m.goalValue.toLocaleString()}`
                          : m.unit === "%"
                          ? `${m.goalValue}%`
                          : m.goalValue.toLocaleString()}
                      </span>
                    </div>
                  </td>

                  {/* Week cells */}
                  {weeks.map((week) => {
                    const weekKey = week.toISOString().split("T")[0];
                    const entry = entryLookup[m.id]?.[weekKey];

                    return (
                      <EntryCell
                        key={`${m.id}-${weekKey}`}
                        entry={entry}
                        unit={m.unit}
                        measurableId={m.id}
                        weekOf={week.toISOString()}
                        onSave={(value) =>
                          createEntry.mutate({
                            measurableId: m.id,
                            weekOf: week.toISOString(),
                            value,
                          })
                        }
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Measurable Modal */}
      {showAddModal && (
        <AddMeasurableForm
          users={users || []}
          isPending={createMeasurable.isPending}
          onClose={() => setShowAddModal(false)}
          onSubmit={(data) => {
            createMeasurable.mutate(
              { ...data, serviceId },
              {
                onSuccess: () => setShowAddModal(false),
              }
            );
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------
// Entry cell with inline editing
// --------------------------------------------------
function EntryCell({
  entry,
  unit,
  measurableId,
  weekOf,
  onSave,
}: {
  entry: { id: string; value: number; onTrack: boolean } | undefined;
  unit: string | null;
  measurableId: string;
  weekOf: string;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const numVal = parseFloat(value);
    if (!isNaN(numVal)) {
      onSave(numVal);
    }
    setEditing(false);
  };

  const formatValue = (val: number) => {
    if (unit === "$") return `$${val.toLocaleString()}`;
    if (unit === "%") return `${val}%`;
    return val.toLocaleString();
  };

  if (editing) {
    return (
      <td className="px-1 py-1">
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full px-1.5 py-1 text-xs text-center border border-[#004E64] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#004E64]"
        />
      </td>
    );
  }

  if (entry) {
    return (
      <td
        onClick={() => {
          setValue(String(entry.value));
          setEditing(true);
        }}
        className={cn(
          "px-1 py-1 text-center cursor-pointer transition-colors hover:opacity-80",
          entry.onTrack
            ? "bg-emerald-50 text-emerald-700"
            : "bg-red-50 text-red-700"
        )}
      >
        <span className="text-xs font-medium">{formatValue(entry.value)}</span>
      </td>
    );
  }

  // Empty cell — small input trigger
  return (
    <td
      onClick={() => {
        setValue("");
        setEditing(true);
      }}
      className="px-1 py-1 text-center cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <span className="text-xs text-gray-300">--</span>
    </td>
  );
}

// --------------------------------------------------
// Add Measurable form modal
// --------------------------------------------------
function AddMeasurableForm({
  users,
  isPending,
  onClose,
  onSubmit,
}: {
  users: UserOption[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    ownerId: string;
    goalValue: number;
    goalDirection: string;
    unit?: string;
    frequency: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [goalDirection, setGoalDirection] = useState<
    "above" | "below" | "exact"
  >("above");
  const [unit, setUnit] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!ownerId) {
      setError("Please select an owner");
      return;
    }
    const numGoal = parseFloat(goalValue);
    if (isNaN(numGoal)) {
      setError("Goal value must be a number");
      return;
    }

    onSubmit({
      title: title.trim(),
      ownerId,
      goalValue: numGoal,
      goalDirection,
      unit: unit || undefined,
      frequency,
    });
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
              Add a new KPI to this service scorecard
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
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
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

          {/* Owner */}
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
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Goal Value + Direction + Unit */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Goal Value
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
                  setGoalDirection(
                    e.target.value as "above" | "below" | "exact"
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="exact">Exact</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit{" "}
                <span className="text-gray-400 font-normal text-xs">
                  (opt)
                </span>
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                placeholder="$, %, etc."
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as "weekly" | "monthly")
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Actions */}
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
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add Measurable"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
