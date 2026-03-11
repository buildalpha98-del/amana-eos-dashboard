"use client";

import { useEffect, useState, useCallback } from "react";
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
import { KanbanColumn } from "./KanbanColumn";
import { EnquiryCard } from "./EnquiryCard";

const COLUMNS = [
  { id: "new_enquiry", label: "New Enquiry" },
  { id: "info_sent", label: "Info Sent" },
  { id: "nurturing", label: "Nurturing" },
  { id: "form_started", label: "Form Started" },
  { id: "enrolled", label: "Enrolled" },
  { id: "first_session", label: "First Session" },
  { id: "retained", label: "Retained" },
];

interface EnquiryKanbanProps {
  serviceId: string;
  refreshKey: number;
  onSelectEnquiry: (id: string) => void;
}

export function EnquiryKanban({
  serviceId,
  refreshKey,
  onSelectEnquiry,
}: EnquiryKanbanProps) {
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchEnquiries = useCallback(() => {
    const url = serviceId
      ? `/api/enquiries?serviceId=${serviceId}&limit=100`
      : "/api/enquiries?limit=100";
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => setEnquiries(data.enquiries || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => {
    fetchEnquiries();
  }, [fetchEnquiries, refreshKey]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const enquiryId = active.id as string;
    const newStage = over.id as string;
    const enquiry = enquiries.find((e) => e.id === enquiryId);
    if (!enquiry || enquiry.stage === newStage) return;

    // Optimistic update
    setEnquiries((prev) =>
      prev.map((e) =>
        e.id === enquiryId
          ? { ...e, stage: newStage, stageChangedAt: new Date().toISOString() }
          : e,
      ),
    );

    try {
      await fetch(`/api/enquiries/${enquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch (err) {
      console.error("Failed to update stage:", err);
      fetchEnquiries(); // Revert on error
    }
  };

  const activeEnquiry = enquiries.find((e) => e.id === activeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            enquiries={enquiries.filter((e) => e.stage === col.id)}
            onSelectEnquiry={onSelectEnquiry}
          />
        ))}
      </div>
      <DragOverlay>
        {activeEnquiry ? (
          <div className="opacity-80 rotate-2">
            <EnquiryCard enquiry={activeEnquiry} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
