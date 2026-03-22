"use client";

import type { TodoData } from "@/hooks/useTodos";
import { TodoItem } from "./TodoItem";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface PersonGroup {
  assignee: TodoData["assignee"];
  todos: TodoData[];
  completedCount: number;
  totalCount: number;
}

export function TodoListByPerson({
  todos,
  onTodoClick,
  selectedIds,
  onToggleSelect,
}: {
  todos: TodoData[];
  onTodoClick?: (todo: TodoData) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  // Group by assignee
  const groups: Record<string, PersonGroup> = {};

  for (const todo of todos) {
    if (!groups[todo.assigneeId]) {
      groups[todo.assigneeId] = {
        assignee: todo.assignee,
        todos: [],
        completedCount: 0,
        totalCount: 0,
      };
    }
    groups[todo.assigneeId].todos.push(todo);
    groups[todo.assigneeId].totalCount++;
    if (todo.status === "complete") {
      groups[todo.assigneeId].completedCount++;
    }
  }

  const sortedGroups = Object.values(groups).sort((a, b) =>
    (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "")
  );

  return (
    <div className="space-y-4">
      {sortedGroups.map((group) => (
        <PersonSection key={group.assignee?.id ?? "unassigned"} group={group} onTodoClick={onTodoClick} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
      ))}
    </div>
  );
}

function PersonSection({
  group,
  onTodoClick,
  selectedIds,
  onToggleSelect,
}: {
  group: PersonGroup;
  onTodoClick?: (todo: TodoData) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const allDone = group.completedCount === group.totalCount;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Person Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted" />
        )}
        <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-brand">
            {(group.assignee?.name ?? "Unassigned")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </span>
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-foreground">
            {group.assignee?.name ?? "Unassigned"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {group.completedCount}/{group.totalCount}
          </span>
          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${
                  group.totalCount > 0
                    ? (group.completedCount / group.totalCount) * 100
                    : 0
                }%`,
                backgroundColor: allDone ? "#004E64" : "#10B981",
              }}
            />
          </div>
        </div>
      </button>

      {/* Todo Items */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {group.todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onClick={onTodoClick ? () => onTodoClick(todo) : undefined}
              selectable={!!onToggleSelect}
              selected={selectedIds?.has(todo.id)}
              onToggleSelect={() => onToggleSelect?.(todo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
