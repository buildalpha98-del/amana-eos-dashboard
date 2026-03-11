"use client";

import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { EnquiryCard } from "./EnquiryCard";

function DraggableCard({
  enquiry,
  onSelect,
}: {
  enquiry: any;
  onSelect: () => void;
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
      <EnquiryCard enquiry={enquiry} onClick={onSelect} />
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

  const stuckCount = enquiries.filter((e) => {
    const days =
      (Date.now() - new Date(e.stageChangedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    return days > 2;
  }).length;

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-lg bg-gray-50 border ${
        isOver ? "border-blue-400 bg-blue-50" : "border-gray-200"
      }`}
    >
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
          <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
            {enquiries.length}
          </span>
        </div>
        {stuckCount > 0 && (
          <span className="text-[10px] text-red-600 font-medium">
            {stuckCount} stuck
          </span>
        )}
      </div>
      <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
        {enquiries.map((enquiry) => (
          <DraggableCard
            key={enquiry.id}
            enquiry={enquiry}
            onSelect={() => onSelectEnquiry(enquiry.id)}
          />
        ))}
        {enquiries.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">No enquiries</p>
        )}
      </div>
    </div>
  );
}
