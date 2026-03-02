"use client";

import { useState, useMemo } from "react";
import { useTodos, type TodoData } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { getWeekStart } from "@/lib/utils";
import { WeekSelector } from "@/components/todos/WeekSelector";
import { TodoListByPerson } from "@/components/todos/TodoListByPerson";
import { TodoItem } from "@/components/todos/TodoItem";
import { CreateTodoModal } from "@/components/todos/CreateTodoModal";
import {
  CheckSquare,
  Plus,
  Users,
  List,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
}

export default function TodosPage() {
  const [weekOf, setWeekOf] = useState(() => getWeekStart());
  const [showCreate, setShowCreate] = useState(false);
  const [groupBy, setGroupBy] = useState<"person" | "flat">("person");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: todos, isLoading } = useTodos({
    weekOf: weekOf.toISOString(),
    ...(filterAssignee ? { assigneeId: filterAssignee } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
  });

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Summary stats
  const stats = useMemo(() => {
    if (!todos) return { total: 0, complete: 0, pending: 0, overdue: 0 };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return {
      total: todos.length,
      complete: todos.filter((t) => t.status === "complete").length,
      pending: todos.filter(
        (t) => t.status === "pending" || t.status === "in_progress"
      ).length,
      overdue: todos.filter(
        (t) =>
          t.status !== "complete" &&
          t.status !== "cancelled" &&
          new Date(t.dueDate) < now
      ).length,
    };
  }, [todos]);

  const hasActiveFilters = filterAssignee || filterStatus;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">To-Dos</h2>
          <p className="text-sm text-gray-500">
            Weekly action items for the L10 meeting rhythm
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Group Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setGroupBy("person")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                groupBy === "person"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Group by person"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGroupBy("flat")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                groupBy === "flat"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
              title="Flat list"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              hasActiveFilters
                ? "border-[#004E64] bg-[#004E64]/5 text-[#004E64]"
                : "border-gray-200 text-gray-400 hover:text-gray-600"
            )}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* Add To-Do */}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add To-Do
          </button>
        </div>
      </div>

      {/* Week Selector */}
      <div className="mb-6">
        <WeekSelector value={weekOf} onChange={setWeekOf} />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All People</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterAssignee("");
                setFilterStatus("");
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Summary Bar */}
      {todos && todos.length > 0 && (
        <div className="flex items-center gap-4 mb-4 px-1">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{stats.total}</span>{" "}
            To-Dos
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-emerald-600">
            {stats.complete} complete
          </span>
          <span className="text-sm text-gray-500">
            {stats.pending} pending
          </span>
          {stats.overdue > 0 && (
            <span className="text-sm text-red-600">
              {stats.overdue} overdue
            </span>
          )}
          {stats.total > 0 && (
            <span className="text-sm text-gray-400 ml-auto">
              {Math.round((stats.complete / stats.total) * 100)}% done
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : todos && todos.length > 0 ? (
        groupBy === "person" ? (
          <TodoListByPerson todos={todos} />
        ) : (
          <div className="space-y-2">
            {todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </div>
        )
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#004E64]/5 flex items-center justify-center mb-4">
            <CheckSquare className="w-8 h-8 text-[#004E64]/30" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No To-Dos this week
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            To-Dos are the weekly action items that push your Rocks forward. Add
            them here or spawn them from Issues in your L10 meetings.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Your First To-Do
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateTodoModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        weekOf={weekOf}
      />
    </div>
  );
}
