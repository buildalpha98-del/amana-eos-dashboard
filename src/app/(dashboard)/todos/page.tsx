"use client";

import { useState, useMemo, useCallback } from "react";
import { useTodos, useUpdateTodo, useDeleteTodo, type TodoData } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { getWeekStart } from "@/lib/utils";
import { WeekSelector } from "@/components/todos/WeekSelector";
import { TodoListByPerson } from "@/components/todos/TodoListByPerson";
import { TodoItem } from "@/components/todos/TodoItem";
import { CreateTodoModal } from "@/components/todos/CreateTodoModal";
import { TodoDetailPanel } from "@/components/todos/TodoDetailPanel";
import {
  CheckSquare,
  Plus,
  Users,
  List,
  Filter,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Trash2,
  X,
  Archive,
  ListPlus,
} from "lucide-react";
import { BulkCreateTodosModal } from "@/components/todos/BulkCreateTodosModal";
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
}

export default function TodosPage() {
  const [weekOf, setWeekOf] = useState(() => getWeekStart());
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<TodoData | null>(null);
  const [groupBy, setGroupBy] = useState<"person" | "flat">("person");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCarryForward, setShowCarryForward] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const { data: todos, isLoading } = useTodos({
    weekOf: weekOf.toISOString(),
    ...(filterAssignee ? { assigneeId: filterAssignee } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
  });

  // Fetch prior week's incomplete todos for carry-forward
  const prevWeek = useMemo(() => {
    const d = new Date(weekOf);
    d.setDate(d.getDate() - 7);
    return d;
  }, [weekOf]);

  const { data: prevTodos } = useTodos({
    weekOf: prevWeek.toISOString(),
  });

  const carryForwardTodos = useMemo(() => {
    if (!prevTodos) return [];
    return prevTodos.filter(
      (t) => t.status !== "complete" && t.status !== "cancelled"
    );
  }, [prevTodos]);

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

  // Filter out completed/cancelled todos when archive is hidden
  const filteredTodos = useMemo(() => {
    if (!todos) return [];
    if (showArchived) return todos;
    return todos.filter((t) => t.status !== "complete" && t.status !== "cancelled");
  }, [todos, showArchived]);

  const hasActiveFilters = filterAssignee || filterStatus;

  // Batch actions
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!todos) return;
    setSelectedIds(new Set(todos.map((t) => t.id)));
  }, [todos]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchComplete = useCallback(async () => {
    const promises = Array.from(selectedIds).map((id) =>
      updateTodo.mutateAsync({ id, status: "complete" })
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
  }, [selectedIds, updateTodo]);

  const handleBatchMoveToThisWeek = useCallback(async () => {
    const promises = Array.from(selectedIds).map((id) =>
      updateTodo.mutateAsync({ id, weekOf: weekOf.toISOString() })
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
  }, [selectedIds, weekOf, updateTodo]);

  const handleBatchDelete = useCallback(async () => {
    const promises = Array.from(selectedIds).map((id) =>
      deleteTodo.mutateAsync(id)
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
  }, [selectedIds, deleteTodo]);

  const handleCarryForward = useCallback(async (todoId: string) => {
    await updateTodo.mutateAsync({ id: todoId, weekOf: weekOf.toISOString() });
  }, [weekOf, updateTodo]);

  const handleCarryForwardAll = useCallback(async () => {
    const promises = carryForwardTodos.map((t) =>
      updateTodo.mutateAsync({ id: t.id, weekOf: weekOf.toISOString() })
    );
    await Promise.all(promises);
  }, [carryForwardTodos, weekOf, updateTodo]);

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

          {/* Archive Toggle */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              showArchived
                ? "border-[#004E64] bg-[#004E64]/5 text-[#004E64]"
                : "border-gray-200 text-gray-400 hover:text-gray-600"
            )}
            title={showArchived ? "Hide completed" : "Show completed"}
          >
            <Archive className="w-4 h-4" />
          </button>

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

          {/* Bulk Create */}
          <button
            onClick={() => setShowBulkCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            title="Bulk create to-dos"
          >
            <ListPlus className="w-4 h-4" />
            Bulk
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
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-white rounded-lg border border-gray-200">
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

      {/* Carry Forward Section */}
      {carryForwardTodos.length > 0 && (
        <div className="mb-4 bg-amber-50/50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCarryForward(!showCarryForward)}
            className="w-full flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-3 hover:bg-amber-50 transition-colors gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              {showCarryForward ? (
                <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="text-sm font-semibold text-amber-800">
                Carried Forward
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium shrink-0">
                {carryForwardTodos.length}
              </span>
              <span className="text-xs text-amber-600 hidden sm:inline">
                incomplete from last week
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCarryForwardAll();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors self-start sm:self-auto shrink-0"
            >
              <ArrowRight className="w-3 h-3" />
              Move all to this week
            </button>
          </button>
          {showCarryForward && (
            <div className="px-4 pb-3 space-y-1.5">
              {carryForwardTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-amber-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {todo.title}
                    </p>
                    <span className="text-xs text-gray-400">
                      {todo.assignee.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCarryForward(todo.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#004E64] bg-[#004E64]/5 hover:bg-[#004E64]/10 rounded transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Move
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary Bar */}
      {todos && todos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 px-1">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{stats.total}</span>{" "}
            To-Dos
          </span>
          <span className="text-gray-300 hidden sm:inline">|</span>
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
            <span className="text-sm text-gray-400 sm:ml-auto">
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
          <TodoListByPerson
            todos={filteredTodos}
            onTodoClick={(todo) => setSelectedTodo(todo)}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <div className="space-y-2">
            {filteredTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onClick={() => setSelectedTodo(todo)}
                selectable
                selected={selectedIds.has(todo.id)}
                onToggleSelect={() => toggleSelect(todo.id)}
              />
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

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-gray-900 text-white rounded-xl shadow-2xl max-w-[calc(100vw-2rem)]">
          <span className="text-xs sm:text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-5 bg-gray-600 hidden sm:block" />
          <button
            onClick={handleBatchComplete}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Complete
          </button>
          <button
            onClick={handleBatchMoveToThisWeek}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-[#004E64] hover:bg-[#003D52] rounded-lg transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Move to this week</span>
            <span className="sm:hidden">Move</span>
          </button>
          <button
            onClick={handleBatchDelete}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateTodoModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        weekOf={weekOf}
      />

      {/* Bulk Create Modal */}
      <BulkCreateTodosModal
        open={showBulkCreate}
        onClose={() => setShowBulkCreate(false)}
        weekOf={weekOf}
      />

      {/* Detail Panel */}
      {selectedTodo && (
        <TodoDetailPanel
          todo={selectedTodo}
          onClose={() => setSelectedTodo(null)}
        />
      )}
    </div>
  );
}
