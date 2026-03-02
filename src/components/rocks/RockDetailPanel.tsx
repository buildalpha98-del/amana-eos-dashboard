"use client";

import { useState } from "react";
import { useRock, useUpdateRock, useDeleteRock } from "@/hooks/useRocks";
import { cn, formatDateAU } from "@/lib/utils";
import {
  X,
  CheckSquare,
  AlertCircle,
  Flag,
  User,
  Target,
  Trash2,
  Save,
} from "lucide-react";
import type { RockStatus, RockPriority } from "@prisma/client";

const statusOptions: { value: RockStatus; label: string; color: string }[] = [
  { value: "on_track", label: "On Track", color: "#10B981" },
  { value: "off_track", label: "Off Track", color: "#EF4444" },
  { value: "complete", label: "Complete", color: "#1B4D3E" },
  { value: "dropped", label: "Dropped", color: "#9CA3AF" },
];

const priorityOptions: { value: RockPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "#EF4444" },
  { value: "high", label: "High", color: "#F59E0B" },
  { value: "medium", label: "Medium", color: "#3B82F6" },
];

export function RockDetailPanel({
  rockId,
  onClose,
}: {
  rockId: string;
  onClose: () => void;
}) {
  const { data: rock, isLoading } = useRock(rockId);
  const updateRock = useUpdateRock();
  const deleteRock = useDeleteRock();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <Panel onClose={onClose}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-6 h-6 border-2 border-[#1B4D3E] border-t-transparent rounded-full" />
        </div>
      </Panel>
    );
  }

  if (!rock) {
    return (
      <Panel onClose={onClose}>
        <p className="text-gray-500 text-center py-12">Rock not found</p>
      </Panel>
    );
  }

  const handleSave = () => {
    updateRock.mutate(
      { id: rock.id, title, description },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    deleteRock.mutate(rock.id, { onSuccess: onClose });
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

  return (
    <Panel onClose={onClose}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-lg font-semibold text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-[#1B4D3E]"
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
              <span className="text-xs text-gray-400">{rock.quarter}</span>
              {rock.oneYearGoal && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-[#1B4D3E]">
                    {rock.oneYearGoal.title}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateRock.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4D3E] text-white text-sm font-medium rounded-lg hover:bg-[#164032] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
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
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
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
                      : "text-gray-600 border-gray-200 hover:border-gray-300"
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
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
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
                      : "text-gray-600 border-gray-200 hover:border-gray-300"
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
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Progress — {rock.percentComplete}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={rock.percentComplete}
            onChange={(e) => handleProgressChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#1B4D3E]"
          />
        </div>

        {/* Owner */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            <User className="w-3.5 h-3.5 inline mr-1" />
            Owner
          </label>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center">
              <span className="text-xs font-medium text-[#1B4D3E]">
                {rock.owner.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {rock.owner.name}
              </p>
              <p className="text-xs text-gray-400">{rock.owner.email}</p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Description
          </label>
          {editing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] resize-none"
              placeholder="Describe the Rock in detail..."
            />
          ) : (
            <p
              className="text-sm text-gray-600 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2"
              onClick={() => {
                setTitle(rock.title);
                setDescription(rock.description || "");
                setEditing(true);
              }}
            >
              {rock.description || (
                <span className="text-gray-400 italic">
                  Click to add a description...
                </span>
              )}
            </p>
          )}
        </div>

        {/* Milestones */}
        {rock.milestones && rock.milestones.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              <Flag className="w-3.5 h-3.5 inline mr-1" />
              Milestones
            </label>
            <div className="space-y-2">
              {rock.milestones.map(
                (m: {
                  id: string;
                  title: string;
                  dueDate: string;
                  completed: boolean;
                }) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-gray-50"
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        m.completed
                          ? "border-[#1B4D3E] bg-[#1B4D3E]"
                          : "border-gray-300"
                      )}
                    >
                      {m.completed && (
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
                    </div>
                    <span
                      className={cn(
                        "text-sm flex-1",
                        m.completed
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
                      )}
                    >
                      {m.title}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDateAU(m.dueDate)}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Linked To-Dos */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
            Linked To-Dos ({rock.todos?.length || 0})
          </label>
          {rock.todos && rock.todos.length > 0 ? (
            <div className="space-y-1">
              {rock.todos.map(
                (todo: {
                  id: string;
                  title: string;
                  status: string;
                  assignee: { name: string };
                }) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50"
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center",
                        todo.status === "complete"
                          ? "border-[#1B4D3E] bg-[#1B4D3E]"
                          : "border-gray-300"
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
                    </div>
                    <span
                      className={cn(
                        "text-sm flex-1",
                        todo.status === "complete"
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
                      )}
                    >
                      {todo.title}
                    </span>
                    <span className="text-xs text-gray-400">
                      {todo.assignee.name}
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No linked To-Dos yet
            </p>
          )}
        </div>

        {/* Linked Issues */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
            Linked Issues ({rock.issues?.length || 0})
          </label>
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
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        issue.priority === "critical"
                          ? "bg-red-500"
                          : issue.priority === "high"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      )}
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {issue.title}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        issue.status === "solved"
                          ? "bg-green-50 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {issue.status.replace("_", " ")}
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No linked Issues yet
            </p>
          )}
        </div>

        {/* Delete */}
        <div className="pt-4 border-t border-gray-200">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-600">
                Are you sure? This cannot be undone.
              </p>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Rock
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Panel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-screen w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {children}
      </div>
    </>
  );
}
