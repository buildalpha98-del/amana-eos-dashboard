"use client";

import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { EnquiryCard } from "./EnquiryCard";

function DraggableCard({
  enquiry,
  onSelect,
  waitlistPosition,
}: {
  enquiry: any;
  onSelect: () => void;
  waitlistPosition?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: enquiry.id });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <EnquiryCard
        enquiry={enquiry}
        onClick={onSelect}
        waitlistPosition={waitlistPosition}
      />
    </div>
  );
}

interface KanbanColumnProps {
  id: string;
  label: string;
  enquiries: any[];
  onSelectEnquiry: (id: string) => void;
}

export function KanbanColumn({
  id,
  label,
  enquiries,
  onSelectEnquiry,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isWaitlisted = id === "waitlisted";

  // Sort waitlisted enquiries by position (or by stageChangedAt as fallback)
  const sorted = isWaitlisted
    ? [...enquiries].sort((a, b) => {
        if (a.waitlistPosition != null && b.waitlistPosition != null) {
          return a.waitlistPosition - b.waitlistPosition;
        }
        return (
          new Date(a.stageChangedAt).getTime() -
          new Date(b.stageChangedAt).getTime()
        );
      })
    : enquiries;

  const stuckCount = enquiries.filter((e) => {
    const days =
      (Date.now() - new Date(e.stageChangedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    return days > 2;
  }).length;

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-lg bg-surface/50 border ${
        isOver ? "border-blue-400 bg-blue-50" : "border-border"
      }`}
    >
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground/80">
              {label}
            </h3>
            {isWaitlisted && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </div>
          <span className="text-xs text-muted bg-border px-1.5 py-0.5 rounded-full">
            {enquiries.length}
          </span>
        </div>
        {stuckCount > 0 && !isWaitlisted && (
          <span className="text-[10px] text-red-600 font-medium">
            {stuckCount} stuck
          </span>
        )}
      </div>
      <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
        {sorted.map((enquiry, index) => (
          <DraggableCard
            key={enquiry.id}
            enquiry={enquiry}
            onSelect={() => onSelectEnquiry(enquiry.id)}
            waitlistPosition={
              isWaitlisted
                ? enquiry.waitlistPosition ?? index + 1
                : undefined
            }
          />
        ))}
        {enquiries.length === 0 && (
          <p className="text-xs text-muted text-center py-8">No enquiries</p>
        )}
      </div>
    </div>
  );
}
