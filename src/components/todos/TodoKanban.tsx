"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import type { TodoData } from "@/hooks/useTodos";
import { useUpdateTodo } from "@/hooks/useTodos";
import type { TodoStatus } from "@prisma/client";
import { Circle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Column config                                                       */
/* ------------------------------------------------------------------ */

const columns: {
  id: TodoStatus;
  label: string;
  icon: typeof Circle;
  color: string;
  borderColor: string;
}[] = [
  { id: "pending", label: "To Do", icon: Circle, color: "text-amber-600", borderColor: "border-amber-400" },
  { id: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-600", borderColor: "border-blue-400" },
  { id: "complete", label: "Complete", icon: CheckCircle2, color: "text-emerald-600", borderColor: "border-emerald-400" },
];

/* ------------------------------------------------------------------ */
/* Droppable column                                                    */
/* ------------------------------------------------------------------ */

function DroppableColumn({
  column,
  todos,
  onTodoClick,
}: {
  column: (typeof columns)[0];
  todos: TodoData[];
  onTodoClick: (todo: TodoData) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const Icon = column.icon;

  return (
    <div className="flex-1 min-w-[260px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
      <div className={`flex items-center gap-2 pb-2 border-b-2 ${column.borderColor}`}>
        <Icon className={`w-4 h-4 ${column.color}`} />
        <h3 className={`text-sm font-semibold ${column.color}`}>
          {column.label}
        </h3>
        <span className={`text-xs ${column.color} ml-auto opacity-70`}>
          {todos.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "space-y-2 min-h-[200px] p-2 mt-2 rounded-xl transition-colors duration-200",
          isOver ? "bg-[#004E64]/5 ring-2 ring-[#004E64]/20" : "bg-gray-50/30"
        )}
      >
        <SortableContext
          items={todos.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {todos.map((todo) => (
            <SortableTodoCard
              key={todo.id}
              todo={todo}
              onClick={() => onTodoClick(todo)}
            />
          ))}
        </SortableContext>

        {todos.length === 0 && (
          <div className="flex items-center justify-center h-[120px] text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            Drop to-dos here
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sortable card wrapper                                               */
/* ------------------------------------------------------------------ */

function SortableTodoCard({
  todo,
  onClick,
}: {
  todo: TodoData;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TodoKanbanCard todo={todo} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function TodoKanbanCard({
  todo,
  onClick,
  isDragging,
}: {
  todo: TodoData;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const isOverdue =
    todo.status !== "complete" &&
    todo.status !== "cancelled" &&
    new Date(todo.dueDate) < new Date();

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow",
        isDragging && "opacity-50 shadow-lg ring-2 ring-[#004E64]/30"
      )}
    >
      <p className="text-sm font-medium text-gray-900 line-clamp-2">
        {todo.title}
      </p>

      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
        {todo.assignee && (
          <span className="truncate max-w-[120px]">
            {todo.assignee.name}
          </span>
        )}
        {isOverdue && (
          <span className="text-red-500 font-medium ml-auto">Overdue</span>
        )}
        {todo.rock && (
          <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[100px]">
            {todo.rock.title}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export                                                         */
/* ------------------------------------------------------------------ */

export function TodoKanban({
  todos,
  onTodoClick,
}: {
  todos: TodoData[];
  onTodoClick: (todo: TodoData) => void;
}) {
  const [activeTodo, setActiveTodo] = useState<TodoData | null>(null);
  const updateTodo = useUpdateTodo();

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Filter out cancelled todos from the board
  const boardTodos = todos.filter((t) => t.status !== "cancelled");

  const todosByStatus = (status: TodoStatus) =>
    boardTodos.filter((t) => t.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const todo = boardTodos.find((t) => t.id === event.active.id);
    if (todo) setActiveTodo(todo);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTodo(null);
    const { active, over } = event;

    if (!over) return;

    const todoId = active.id as string;
    const targetStatus = over.id as TodoStatus;

    // Only accept drops on valid column targets (not other cards)
    if (!columns.some((c) => c.id === targetStatus)) return;

    const todo = boardTodos.find((t) => t.id === todoId);
    if (todo && todo.status !== targetStatus) {
      updateTodo.mutate({
        id: todoId,
        status: targetStatus,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            todos={todosByStatus(col.id)}
            onTodoClick={onTodoClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTodo && (
          <div className="w-[280px]">
            <TodoKanbanCard todo={activeTodo} onClick={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
