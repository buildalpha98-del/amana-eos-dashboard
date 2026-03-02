"use client";

import { useState } from "react";
import type { OneYearGoal } from "@/hooks/useVTO";
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from "@/hooks/useVTO";
import { cn } from "@/lib/utils";
import {
  Plus,
  Target,
  Mountain,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";

const statusColors = {
  on_track: { label: "On Track", bg: "bg-emerald-100 text-emerald-700" },
  at_risk: { label: "At Risk", bg: "bg-yellow-100 text-yellow-700" },
  off_track: { label: "Off Track", bg: "bg-red-100 text-red-700" },
  complete: { label: "Complete", bg: "bg-blue-100 text-blue-700" },
};

export function GoalsSection({
  goals,
  vtoId,
}: {
  goals: OneYearGoal[];
  vtoId: string;
}) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createGoal.mutate(
      {
        title: newTitle,
        description: newDesc || undefined,
        vtoId,
        targetDate: new Date(new Date().getFullYear(), 11, 31).toISOString(),
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewDesc("");
          setShowAdd(false);
        },
      }
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700">
          1-Year Goals ({goals.length})
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 text-[#004E64] hover:bg-[#004E64]/5 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Goal
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Add form */}
        {showAdd && (
          <div className="px-5 py-4 bg-[#004E64]/[0.02] space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Goal title..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={createGoal.isPending || !newTitle.trim()}
                className="text-xs px-3 py-1.5 bg-[#004E64] text-white rounded-md hover:bg-[#003D52] disabled:opacity-50"
              >
                {createGoal.isPending ? "Creating..." : "Create Goal"}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="text-xs px-3 py-1.5 text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Goals list */}
        {goals.length > 0 ? (
          goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} onUpdate={updateGoal} onDelete={deleteGoal} />
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <Target className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              No 1-year goals set — add one above
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  onUpdate,
  onDelete,
}: {
  goal: OneYearGoal;
  onUpdate: ReturnType<typeof useUpdateGoal>;
  onDelete: ReturnType<typeof useDeleteGoal>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const s = statusColors[goal.status];

  return (
    <div className="group">
      <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <Target className="w-4 h-4 text-[#004E64] flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900">{goal.title}</span>
        </div>

        {/* Status picker */}
        <select
          value={goal.status}
          onChange={(e) =>
            onUpdate.mutate({ id: goal.id, status: e.target.value as OneYearGoal["status"] })
          }
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer appearance-none text-center",
            s.bg
          )}
          style={{ WebkitAppearance: "none" }}
        >
          {Object.entries(statusColors).map(([key, val]) => (
            <option key={key} value={key}>
              {val.label}
            </option>
          ))}
        </select>

        {/* Rocks count */}
        {goal.rocks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Mountain className="w-3 h-3" />
            {goal.rocks.length}
          </span>
        )}

        {/* Delete */}
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete.mutate(goal.id)}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="p-0.5 text-gray-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded: description + linked rocks */}
      {expanded && (
        <div className="px-12 pb-3 space-y-2">
          {goal.description && (
            <p className="text-xs text-gray-500 leading-relaxed">
              {goal.description}
            </p>
          )}
          {goal.rocks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                Linked Rocks
              </p>
              {goal.rocks.map((rock) => (
                <div
                  key={rock.id}
                  className="flex items-center gap-2 px-2 py-1 bg-[#004E64]/5 rounded"
                >
                  <Mountain className="w-3 h-3 text-[#004E64]" />
                  <span className="text-xs text-gray-700 flex-1">
                    {rock.title}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {rock.percentComplete}%
                  </span>
                </div>
              ))}
            </div>
          )}
          {goal.targetDate && (
            <p className="text-[10px] text-gray-400">
              Target:{" "}
              {new Date(goal.targetDate).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
