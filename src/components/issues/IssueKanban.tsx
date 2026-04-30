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
import type { IssueData } from "@/hooks/useIssues";
import { useUpdateIssue } from "@/hooks/useIssues";
import { IssueCard, type IssueCardOpenOpts } from "./IssueCard";
import type { IssueStatus } from "@prisma/client";
import { AlertTriangle, MessageSquare, CheckCircle2, XCircle } from "lucide-react";

const activeColumns: { id: IssueStatus; label: string; icon: typeof AlertTriangle; color: string; borderColor: string }[] = [
  { id: "open", label: "Identify", icon: AlertTriangle, color: "text-amber-600", borderColor: "border-amber-400" },
  { id: "in_discussion", label: "Discuss", icon: MessageSquare, color: "text-blue-600", borderColor: "border-blue-400" },
  { id: "solved", label: "Solved", icon: CheckCircle2, color: "text-emerald-600", borderColor: "border-emerald-400" },
];

const closedColumn: (typeof activeColumns)[0] = {
  id: "closed",
  label: "Closed",
  icon: XCircle,
  color: "text-muted",
  borderColor: "border-border",
};

function DroppableColumn({
  column,
  issues,
  onIssueClick,
}: {
  column: (typeof activeColumns)[0];
  issues: IssueData[];
  onIssueClick: (id: string, opts?: IssueCardOpenOpts) => void;
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
          isOver ? "bg-brand/5 ring-2 ring-brand/20" : "bg-surface/30"
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
              onClick={(opts) => onIssueClick(issue.id, opts)}
            />
          ))}
        </SortableContext>

        {issues.length === 0 && (
          <div className="flex items-center justify-center h-[120px] text-sm text-muted border-2 border-dashed border-border rounded-lg">
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
  onClick: (opts?: IssueCardOpenOpts) => void;
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
  showClosed = false,
}: {
  issues: IssueData[];
  onSelect: (id: string, opts?: IssueCardOpenOpts) => void;
  showClosed?: boolean;
}) {
  const [activeIssue, setActiveIssue] = useState<IssueData | null>(null);
  const updateIssue = useUpdateIssue();

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columns = showClosed ? [...activeColumns, closedColumn] : activeColumns;

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

    // Only accept drops on valid column targets (not other cards)
    if (!columns.some((c) => c.id === targetStatus)) return;

    const issue = issues.find((i) => i.id === issueId);
    if (issue && issue.status !== targetStatus) {
      updateIssue.mutate({
        id: issueId,
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
      <div
        className={`flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid ${
          showClosed ? "sm:grid-cols-4" : "sm:grid-cols-3"
        } sm:overflow-visible`}
      >
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
