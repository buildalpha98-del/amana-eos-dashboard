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
import type { RockData } from "@/hooks/useRocks";
import { useUpdateRock } from "@/hooks/useRocks";
import { RockCard } from "./RockCard";
import type { RockStatus } from "@prisma/client";

const columns: { id: RockStatus; label: string; color: string }[] = [
  { id: "on_track", label: "On Track", color: "#10B981" },
  { id: "off_track", label: "Off Track", color: "#EF4444" },
  { id: "complete", label: "Complete", color: "#004E64" },
];

function DroppableColumn({
  column,
  rocks,
  onRockClick,
}: {
  column: (typeof columns)[0];
  rocks: RockData[];
  onRockClick: (rock: RockData) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex-1 min-w-[260px] sm:min-w-[300px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-sm font-semibold text-foreground/80">{column.label}</h3>
        <span className="text-xs text-muted bg-surface rounded-full px-2 py-0.5">
          {rocks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-3 min-h-[200px] p-2 rounded-xl transition-colors duration-200 ${
          isOver ? "bg-brand/5 ring-2 ring-brand/20" : "bg-surface/50"
        }`}
      >
        <SortableContext
          items={rocks.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {rocks.map((rock) => (
            <SortableRockCard
              key={rock.id}
              rock={rock}
              onClick={() => onRockClick(rock)}
            />
          ))}
        </SortableContext>

        {rocks.length === 0 && (
          <div className="flex items-center justify-center h-[120px] text-sm text-muted border-2 border-dashed border-border rounded-lg">
            Drop rocks here
          </div>
        )}
      </div>
    </div>
  );
}

function SortableRockCard({
  rock,
  onClick,
}: {
  rock: RockData;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rock.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RockCard rock={rock} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

export function RockKanban({
  rocks,
  onRockClick,
}: {
  rocks: RockData[];
  onRockClick: (rock: RockData) => void;
}) {
  const [activeRock, setActiveRock] = useState<RockData | null>(null);
  const updateRock = useUpdateRock();

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const rocksByStatus = (status: RockStatus) =>
    rocks.filter((r) => r.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const rock = rocks.find((r) => r.id === event.active.id);
    if (rock) setActiveRock(rock);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveRock(null);
    const { active, over } = event;

    if (!over) return;

    const rockId = active.id as string;
    const targetStatus = over.id as RockStatus;

    // Only accept drops on valid column targets (not other cards)
    if (!columns.some((c) => c.id === targetStatus)) return;

    const rock = rocks.find((r) => r.id === rockId);
    if (rock && rock.status !== targetStatus) {
      updateRock.mutate({
        id: rockId,
        status: targetStatus,
        ...(targetStatus === "complete" ? { percentComplete: 100 } : {}),
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
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            rocks={rocksByStatus(col.id)}
            onRockClick={onRockClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeRock && (
          <div className="w-[300px]">
            <RockCard rock={activeRock} onClick={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
