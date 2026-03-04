"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
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
import type { IssueData } from "@/hooks/useIssues";
import { useUpdateIssue } from "@/hooks/useIssues";
import { IssueCard } from "./IssueCard";
import type { IssueStatus } from "@prisma/client";
import { AlertTriangle, MessageSquare, CheckCircle2 } from "lucide-react";

const columns: { id: IssueStatus; label: string; icon: typeof AlertTriangle; color: string; borderColor: string }[] = [
  { id: "open", label: "Identify", icon: AlertTriangle, color: "text-amber-600", borderColor: "border-amber-400" },
  { id: "in_discussion", label: "Discuss", icon: MessageSquare, color: "text-blue-600", borderColor: "border-blue-400" },
  { id: "solved", label: "Solved", icon: CheckCircle2, color: "text-emerald-600", borderColor: "border-emerald-400" },
];

function DroppableColumn({
  column,
  issues,
  onIssueClick,
}: {
  column: (typeof columns)[0];
  issues: IssueData[];
  onIssueClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const Icon = column.icon;

  return (
    <div className="flex-1 min-w-[280px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
      <div className={`flex items-center gap-2 pb-2 border-b-2 ${column.borderColor}`}>
        <Icon className={`w-4 h-4 ${column.color}`} />
        <h3 className={`text-sm font-semibold ${column.color}`}>
          {column.label}
        </h3>
        <span className={`text-xs ${column.color} ml-auto opacity-70`}>
          {issues.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-3 min-h-[200px] p-2 mt-2 rounded-xl transition-colors duration-200 ${
          isOver ? "bg-[#004E64]/5 ring-2 ring-[#004E64]/20" : "bg-gray-50/30"
        }`}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick(issue.id)}
            />
          ))}
        </SortableContext>

        {issues.length === 0 && (
          <div className="flex items-center justify-center h-[120px] text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            Drop issues here
          </div>
        )}
      </div>
    </div>
  );
}

function SortableIssueCard({
  issue,
  onClick,
}: {
  issue: IssueData;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <IssueCard issue={issue} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

export function IssueKanban({
  issues,
  onSelect,
}: {
  issues: IssueData[];
  onSelect: (id: string) => void;
}) {
  const [activeIssue, setActiveIssue] = useState<IssueData | null>(null);
  const updateIssue = useUpdateIssue();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const issuesByStatus = (status: IssueStatus) =>
    issues.filter((i) => i.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const issue = issues.find((i) => i.id === event.active.id);
    if (issue) setActiveIssue(issue);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;

    if (!over) return;

    const issueId = active.id as string;
    const targetStatus = over.id as IssueStatus;

    // Check if dropped on a column
    if (columns.some((c) => c.id === targetStatus)) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue && issue.status !== targetStatus) {
        updateIssue.mutate({
          id: issueId,
          status: targetStatus,
        });
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {columns.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            issues={issuesByStatus(col.id)}
            onIssueClick={onSelect}
          />
        ))}
      </div>

      <DragOverlay>
        {activeIssue && (
          <div className="w-[300px]">
            <IssueCard issue={activeIssue} onClick={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
