"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTodos, useUpdateTodo, useDeleteTodo, useCreateTodo, useBulkTodoAction, type TodoData } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { getWeekStart } from "@/lib/utils";
import { WeekSelector } from "@/components/todos/WeekSelector";
import { TodoListByPerson } from "@/components/todos/TodoListByPerson";
import { TodoItem } from "@/components/todos/TodoItem";
import { CreateTodoModal } from "@/components/todos/CreateTodoModal";
import { TodoDetailPanel } from "@/components/todos/TodoDetailPanel";
import { TodoKanban } from "@/components/todos/TodoKanban";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  CheckSquare,
  Plus,
  Users,
  List,
  LayoutGrid,
  Filter,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Trash2,
  X,
  Archive,
  ListPlus,
  Repeat,
  Loader2,
  Download,
  UserPlus,
} from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import { BulkCreateTodosModal } from "@/components/todos/BulkCreateTodosModal";
import { TemplateManagerModal } from "@/components/todos/TemplateManagerModal";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterPresets } from "@/components/ui/FilterPresets";
import { PageHeader } from "@/components/layout/PageHeader";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";

interface UserOption {
  id: string;
  name: string;
}

export default function TodosPage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>}>
      <TodosPageContent />
    </Suspense>
  );
}

function TodosPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const [weekOf, setWeekOf] = useState(() => getWeekStart());
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<TodoData | null>(null);

  // Read filters from URL search params
  const groupByParam = searchParams.get("groupBy");
  const groupBy: "person" | "flat" = groupByParam === "flat" ? "flat" : "person";
  const viewModeParam = searchParams.get("view");
  const viewMode: "list" | "board" = viewModeParam === "board" ? "board" : "list";
  const filterAssignee = searchParams.get("assignee") || "";
  const filterStatus = searchParams.get("status") || "";

  const setMultiParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const setGroupBy = useCallback((v: "person" | "flat") => setParam("groupBy", v === "person" ? "" : v), [setParam]);
  const setViewMode = useCallback((v: "list" | "board") => setParam("view", v === "list" ? "" : v), [setParam]);
  const setFilterAssignee = useCallback((v: string) => setParam("assignee", v), [setParam]);
  const setFilterStatus = useCallback((v: string) => setParam("status", v), [setParam]);

  const [showFilters, setShowFilters] = useState(!!(filterAssignee || filterStatus));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCarryForward, setShowCarryForward] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const createTodo = useCreateTodo();
  const bulkAction = useBulkTodoAction();
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  const { data: todos, isLoading, error, refetch } = useTodos({
    ...(showAll ? {} : { weekOf: weekOf.toISOString() }),
    ...(filterAssignee ? { assigneeId: filterAssignee } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
  });

  // Pull-to-refresh (mobile)
  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => { await refetch(); },
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
    if (!filteredTodos || filteredTodos.length === 0) return;
    setSelectedIds(new Set(filteredTodos.map((t) => t.id)));
  }, [filteredTodos]);

  const allSelected = filteredTodos.length > 0 && selectedIds.size === filteredTodos.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredTodos.length;

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchComplete = useCallback(async () => {
    await bulkAction.mutateAsync({
      action: "complete",
      ids: Array.from(selectedIds),
    });
    setSelectedIds(new Set());
  }, [selectedIds, bulkAction]);

  const handleBatchMoveToThisWeek = useCallback(async () => {
    const promises = Array.from(selectedIds).map((id) =>
      updateTodo.mutateAsync({ id, weekOf: weekOf.toISOString() })
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
  }, [selectedIds, weekOf, updateTodo]);

  const handleBatchDelete = useCallback(async () => {
    await bulkAction.mutateAsync({
      action: "delete",
      ids: Array.from(selectedIds),
    });
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  }, [selectedIds, bulkAction]);

  const handleBatchAssign = useCallback(async (assigneeId: string) => {
    await bulkAction.mutateAsync({
      action: "assign",
      ids: Array.from(selectedIds),
      assigneeId,
    });
    setSelectedIds(new Set());
    setBulkAssignOpen(false);
  }, [selectedIds, bulkAction]);

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
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

      {/* Header */}
      <PageHeader
        title="To-Dos"
        description={showAll ? "All active action items across every week" : "Weekly action items for the L10 meeting rhythm"}
        helpTooltipId="todos-heading"
        helpTooltipContent="7-day action items. Every to-do should be completable within one week. If it takes longer, it's probably a Rock."
        primaryAction={{ label: "Add To-Do", icon: Plus, onClick: () => setShowCreate(true) }}
        toggles={[{
          options: [
            { icon: Users, label: "Group by person", value: "person" },
            { icon: List, label: "Flat list", value: "flat" },
            { icon: LayoutGrid, label: "Board view", value: "board" },
          ],
          value: viewMode === "board" ? "board" : groupBy,
          onChange: (v) => {
            if (v === "board") setMultiParams({ view: "board", groupBy: "" });
            else setMultiParams({ view: "", groupBy: v === "person" ? "" : v });
          },
        }]}
        secondaryActions={[
          {
            label: showArchived ? "Hide Completed" : "Show Completed",
            icon: Archive,
            onClick: () => setShowArchived(!showArchived),
            active: showArchived,
          },
          {
            label: "Filters",
            icon: Filter,
            onClick: () => setShowFilters(!showFilters),
            active: !!hasActiveFilters,
          },
          {
            label: "Export CSV",
            icon: Download,
            onClick: () =>
              exportToCsv("todos", filteredTodos, [
                { header: "Title", accessor: (t) => t.title },
                { header: "Assignee", accessor: (t) => t.assignee?.name ?? "Unassigned" },
                { header: "Due Date", accessor: (t) => new Date(t.dueDate).toLocaleDateString("en-AU") },
                { header: "Status", accessor: (t) => t.status },
                { header: "Rock", accessor: (t) => t.rock?.title ?? "" },
              ]),
          },
          {
            label: "Bulk Create",
            icon: ListPlus,
            onClick: () => setShowBulkCreate(true),
          },
          {
            label: "Templates",
            icon: Repeat,
            onClick: () => setShowTemplates(true),
          },
        ]}
      />

      {/* Week Selector with All toggle */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center bg-surface rounded-lg p-0.5">
          <button
            onClick={() => setShowAll(true)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              showAll
                ? "bg-card text-brand shadow-sm"
                : "text-muted hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => setShowAll(false)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              !showAll
                ? "bg-card text-brand shadow-sm"
                : "text-muted hover:text-foreground"
            )}
          >
            Weekly
          </button>
        </div>
        {!showAll && <WeekSelector value={weekOf} onChange={setWeekOf} />}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-card rounded-lg border border-border">
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-foreground/80 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => setMultiParams({ assignee: "", status: "" })}
              className="text-xs text-muted hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Saved Filter Presets */}
      <div className="mb-4">
        <FilterPresets
          pageKey="todos"
          currentFilters={{
            assignee: filterAssignee,
            status: filterStatus,
            view: viewModeParam || "",
            groupBy: groupByParam || "",
          }}
          onLoadPreset={(filters) => {
            setMultiParams({
              assignee: filters.assignee || "",
              status: filters.status || "",
              view: filters.view || "",
              groupBy: filters.groupBy || "",
            });
            if (!showFilters && (filters.assignee || filters.status)) {
              setShowFilters(true);
            }
          }}
        />
      </div>

      {/* Carry Forward Section (weekly mode only) */}
      {!showAll && carryForwardTodos.length > 0 && (
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
                  className="flex items-center gap-3 px-3 py-2 bg-card rounded-lg border border-amber-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {todo.title}
                    </p>
                    <span className="text-xs text-muted">
                      {todo.assignee?.name ?? "Unassigned"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCarryForward(todo.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand bg-brand/5 hover:bg-brand/10 rounded transition-colors"
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

      {/* Error State */}
      {error && (
        <ErrorState
          title="Failed to load to-dos"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {/* Summary Bar */}
      {!error && todos && todos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 px-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => {
                if (allSelected || someSelected) clearSelection();
                else selectAll();
              }}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30 cursor-pointer"
            />
            <span className="text-xs text-muted">
              {allSelected ? "Deselect all" : "Select all"}
            </span>
          </label>
          <span className="text-border hidden sm:inline">|</span>
          <span className="text-sm text-muted">
            <span className="font-semibold text-foreground">{stats.total}</span>{" "}
            To-Dos
          </span>
          <span className="text-border hidden sm:inline">|</span>
          <span className="text-sm text-success">
            {stats.complete} complete
          </span>
          <span className="text-sm text-muted">
            {stats.pending} pending
          </span>
          {stats.overdue > 0 && (
            <span className="text-sm text-danger">
              {stats.overdue} overdue
            </span>
          )}
          {stats.total > 0 && (
            <span className="text-sm text-muted sm:ml-auto">
              {Math.round((stats.complete / stats.total) * 100)}% done
            </span>
          )}
        </div>
      )}

      {/* Quick-Add Input */}
      {!error && session?.user?.id && (
        <div className="mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = quickAddTitle.trim();
              if (!title) return;
              const dueDate = new Date(weekOf);
              dueDate.setDate(dueDate.getDate() + 6); // End of the week
              createTodo.mutate(
                {
                  title,
                  assigneeId: session.user.id,
                  weekOf: weekOf.toISOString(),
                  dueDate: dueDate.toISOString(),
                },
                { onSuccess: () => setQuickAddTitle("") }
              );
            }}
            className="flex items-center gap-2"
          >
            <div className="flex-1 relative">
              <input
                type="text"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                placeholder="Quick add a to-do... (press Enter)"
                className="w-full rounded-lg border border-border pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-muted"
              />
              {createTodo.isPending && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted" />
              )}
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {error ? null : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 bg-card rounded-lg border border-border px-4 py-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 flex-1 max-w-xs" />
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : todos && todos.length > 0 ? (
        viewMode === "board" ? (
          <TodoKanban
            todos={filteredTodos}
            onTodoClick={(todo) => setSelectedTodo(todo)}
          />
        ) : groupBy === "person" ? (
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
        <EmptyState
          icon={CheckSquare}
          title={showAll ? "No active To-Dos" : "No To-Dos this week"}
          description="To-Dos are the weekly action items that push your Rocks forward. Add them here or spawn them from Issues in your L10 meetings."
          action={{ label: "Create Your First To-Do", onClick: () => setShowCreate(true) }}
        />
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-30 bg-card border border-border rounded-xl shadow-lg p-4 max-w-[calc(100vw-2rem)]">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-5 bg-border hidden sm:block" />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={handleBatchComplete}
                disabled={bulkAction.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Mark Complete
              </button>

              {/* Assign To Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setBulkAssignOpen(!bulkAssignOpen)}
                  disabled={bulkAction.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand hover:bg-brand-hover rounded-lg transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign To
                  <ChevronDown className="w-3 h-3" />
                </button>
                {bulkAssignOpen && (
                  <div className="absolute bottom-full mb-1 left-0 w-48 bg-card border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto z-40">
                    {users?.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleBatchAssign(u.id)}
                        className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        {u.name}
                      </button>
                    ))}
                    {(!users || users.length === 0) && (
                      <span className="block px-3 py-1.5 text-sm text-muted-foreground">No users found</span>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleBatchMoveToThisWeek}
                disabled={bulkAction.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors border border-border disabled:opacity-50"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Move to this week</span>
                <span className="sm:hidden">Move</span>
              </button>

              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={bulkAction.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>

              <button
                onClick={() => {
                  clearSelection();
                  setBulkAssignOpen(false);
                }}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title="Delete selected to-dos"
        description={`Are you sure you want to delete ${selectedIds.size} to-do${selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleBatchDelete}
        loading={bulkAction.isPending}
      />

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

      {/* Template Manager Modal */}
      {showTemplates && (
        <TemplateManagerModal onClose={() => setShowTemplates(false)} />
      )}

      {/* Detail Panel */}
      {selectedTodo && (
        <TodoDetailPanel
          open={!!selectedTodo}
          todo={selectedTodo}
          onClose={() => setSelectedTodo(null)}
        />
      )}
    </div>
  );
}
