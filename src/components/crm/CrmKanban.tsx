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
import type { LeadSummary } from "@/hooks/useCRM";
import { useUpdateLead } from "@/hooks/useCRM";
import { LeadCard } from "./LeadCard";
import type { PipelineStage } from "@prisma/client";

const columns: { id: PipelineStage; label: string; color: string }[] = [
  { id: "new_lead", label: "New Lead", color: "#6366F1" },
  { id: "reviewing", label: "Reviewing", color: "#8B5CF6" },
  { id: "contact_made", label: "Contact Made", color: "#3B82F6" },
  { id: "follow_up_1", label: "Follow-up 1", color: "#0EA5E9" },
  { id: "follow_up_2", label: "Follow-up 2", color: "#06B6D4" },
  { id: "meeting_booked", label: "Meeting", color: "#14B8A6" },
  { id: "proposal_sent", label: "Proposal Sent", color: "#F59E0B" },
  { id: "submitted", label: "Submitted", color: "#F97316" },
  { id: "negotiating", label: "Negotiating", color: "#EF4444" },
  { id: "won", label: "Won", color: "#10B981" },
  { id: "lost", label: "Lost", color: "#6B7280" },
  { id: "on_hold", label: "On Hold", color: "#9CA3AF" },
];

function DroppableColumn({
  column,
  leads,
  onLeadClick,
}: {
  column: (typeof columns)[0];
  leads: LeadSummary[];
  onLeadClick: (lead: LeadSummary) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex-shrink-0 w-[220px]">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-xs font-semibold text-gray-700 truncate">
          {column.label}
        </h3>
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
          {leads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] p-1.5 rounded-xl transition-colors duration-200 ${
          isOver ? "bg-[#004E64]/5 ring-2 ring-[#004E64]/20" : "bg-gray-50/50"
        }`}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <SortableLeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onLeadClick(lead)}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-[100px] text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

function SortableLeadCard({
  lead,
  onClick,
}: {
  lead: LeadSummary;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

export function CrmKanban({
  leads,
  onLeadClick,
}: {
  leads: LeadSummary[];
  onLeadClick: (lead: LeadSummary) => void;
}) {
  const [activeLead, setActiveLead] = useState<LeadSummary | null>(null);
  const updateLead = useUpdateLead();

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const leadsByStage = (stage: PipelineStage) =>
    leads.filter((l) => l.pipelineStage === stage);

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead) setActiveLead(lead);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;

    if (!over) return;

    const leadId = active.id as string;
    const targetStage = over.id as PipelineStage;

    // Only accept drops on valid column targets
    if (!columns.some((c) => c.id === targetStage)) return;

    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.pipelineStage !== targetStage) {
      updateLead.mutate({ id: leadId, pipelineStage: targetStage });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            leads={leadsByStage(col.id)}
            onLeadClick={onLeadClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && (
          <div className="w-[220px]">
            <LeadCard lead={activeLead} onClick={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
