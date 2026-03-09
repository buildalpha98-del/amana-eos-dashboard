"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Zap,
  LayoutGrid,
  List,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react";
import {
  useMarketingTasks,
  useUpdateMarketingTask,
  useCreateMarketingTask,
  useCampaigns,
} from "@/hooks/useMarketing";
import type { MarketingTaskData } from "@/hooks/useMarketing";
import { CreateTaskModal } from "./CreateTaskModal";
import { TaskTemplatePickerModal } from "./TaskTemplatePickerModal";

interface TasksTabProps {
  serviceId?: string;
  onSelectTask: (id: string) => void;
}

const STATUS_COLUMNS = [
  {
    key: "todo" as const,
    label: "To Do",
    icon: AlertCircle,
    color: "border-gray-300",
    bg: "bg-gray-50",
    badge: "bg-gray-100 text-gray-700",
  },
  {
    key: "in_progress" as const,
    label: "In Progress",
    icon: Clock,
    color: "border-blue-300",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    key: "in_review" as const,
    label: "In Review",
    icon: Eye,
    color: "border-amber-300",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    key: "done" as const,
    label: "Done",
    icon: CheckCircle2,
    color: "border-emerald-300",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
  },
];

const PRIORITY_COLORS = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function getDueIndicator(dueDate: string | null): {
  label: string;
  className: string;
} | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return {
      label: `${Math.abs(diffDays)}d overdue`,
      className: "text-red-600 bg-red-50",
    };
  }
  if (diffDays === 0) {
    return { label: "Due today", className: "text-amber-600 bg-amber-50" };
  }
  if (diffDays <= 3) {
    return {
      label: `${diffDays}d left`,
      className: "text-amber-600 bg-amber-50",
    };
  }
  return {
    label: new Date(dueDate).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    }),
    className: "text-gray-500 bg-gray-50",
  };
}

export function TasksTab({ serviceId, onSelectTask }: TasksTabProps) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [quickAddColumn, setQuickAddColumn] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const { data: tasks, isLoading } = useMarketingTasks({
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    serviceId: serviceId || undefined,
  });
  const updateTask = useUpdateMarketingTask();
  const createTask = useCreateMarketingTask();

  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: string) => {
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
      setDraggingTaskId(taskId);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      setDragOverColumn(null);
      setDraggingTaskId(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId) {
        updateTask.mutate({
          id: taskId,
          status: newStatus as MarketingTaskData["status"],
        });
      }
    },
    [updateTask]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDragOverColumn(columnKey);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, columnElement: HTMLElement) => {
    // Only clear if leaving the column itself, not just a child element
    if (!columnElement.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleQuickAdd = useCallback(
    (status: string) => {
      if (!quickAddTitle.trim()) return;
      createTask.mutate(
        {
          title: quickAddTitle.trim(),
          status: status as MarketingTaskData["status"],
          serviceId: serviceId || undefined,
        },
        {
          onSuccess: () => {
            setQuickAddTitle("");
            setQuickAddColumn(null);
          },
        }
      );
    },
    [quickAddTitle, createTask, serviceId]
  );

  const tasksByStatus = STATUS_COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = (tasks ?? []).filter((t) => t.status === col.key);
      return acc;
    },
    {} as Record<string, MarketingTaskData[]>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View Toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              view === "kanban"
                ? "bg-brand text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
              view === "list"
                ? "bg-brand text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-brand/5 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Quick Start
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          Loading tasks...
        </div>
      ) : view === "kanban" ? (
        /* Kanban View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((col) => {
            const columnTasks = tasksByStatus[col.key] ?? [];
            const Icon = col.icon;

            return (
              <div
                key={col.key}
                className={`rounded-xl border-2 min-h-[200px] flex flex-col transition-all duration-150 ${
                  dragOverColumn === col.key
                    ? "border-brand bg-brand/5 ring-2 ring-brand/20 scale-[1.01]"
                    : `${col.color} ${col.bg}`
                }`}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, col.key)}
                onDragLeave={(e) => handleDragLeave(e, e.currentTarget)}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200/50">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500" />
                    <h4 className="text-sm font-semibold text-gray-700">
                      {col.label}
                    </h4>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${col.badge}`}
                    >
                      {columnTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setQuickAddColumn(
                        quickAddColumn === col.key ? null : col.key
                      );
                      setQuickAddTitle("");
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-white/60 hover:text-gray-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Quick Add */}
                {quickAddColumn === col.key && (
                  <div className="px-3 py-2 border-b border-gray-200/50">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleQuickAdd(col.key);
                        if (e.key === "Escape") setQuickAddColumn(null);
                      }}
                      placeholder="Task title..."
                      autoFocus
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <div className="flex gap-1.5 mt-1.5">
                      <button
                        onClick={() => handleQuickAdd(col.key)}
                        disabled={!quickAddTitle.trim()}
                        className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setQuickAddColumn(null)}
                        className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Task Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[500px]">
                  {columnTasks.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-6">
                      No tasks
                    </p>
                  )}
                  {columnTasks.map((task) => {
                    const dueIndicator = getDueIndicator(task.dueDate);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onSelectTask(task.id)}
                        className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all group ${
                          draggingTaskId === task.id ? "opacity-40 scale-95 rotate-1" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                            {task.title}
                          </p>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              PRIORITY_COLORS[task.priority]
                            }`}
                          >
                            {task.priority.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {dueIndicator && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${dueIndicator.className}`}
                            >
                              <Calendar className="h-3 w-3" />
                              {dueIndicator.label}
                            </span>
                          )}
                          {task.assignee && (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {task.assignee.name.split(" ")[0]}
                            </span>
                          )}
                          {task.campaign && (
                            <span className="inline-flex items-center rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                              {task.campaign.name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {!tasks || tasks.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              No tasks found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Assignee</th>
                    <th className="px-4 py-3">Campaign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tasks.map((task) => {
                    const dueIndicator = getDueIndicator(task.dueDate);
                    return (
                      <tr
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {task.title}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              PRIORITY_COLORS[task.priority]
                            }`}
                          >
                            {task.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize text-gray-600">
                            {task.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {dueIndicator ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${dueIndicator.className}`}
                            >
                              {dueIndicator.label}
                            </span>
                          ) : (
                            <span className="text-gray-400">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {task.assignee?.name ?? "Unassigned"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {task.campaign?.name ?? "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Template Picker Modal */}
      <TaskTemplatePickerModal
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
      />
    </div>
  );
}
