"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useAuditInstances,
  useRescheduleAudit,
  type AuditInstanceSummary,
} from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  SkipForward,
  Loader2,
  Upload,
  FileUp,
  Pencil,
  PlusCircle,
} from "lucide-react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AuditEditModal } from "@/components/audits/AuditEditModal";
import { UploadCalendarDialog } from "@/components/audits/UploadCalendarDialog";
import { UploadAuditDocumentsDialog } from "@/components/audits/UploadAuditDocumentsDialog";
import { fetchApi } from "@/lib/fetch-api";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const qaLabels: Record<number, string> = {
  1: "Educational Program",
  2: "Health & Safety",
  3: "Physical Environment",
  4: "Staffing",
  5: "Relationships",
  6: "Partnerships",
  7: "Governance",
};

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: typeof Clock }> = {
  scheduled: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Clock },
  in_progress: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Play },
  completed: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
  overdue: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle },
  skipped: { color: "text-muted", bg: "bg-surface/50", border: "border-border", icon: SkipForward },
};

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/* Draggable / Droppable primitives                                     */
/* ------------------------------------------------------------------ */

function DraggableAudit({
  audit,
  onEdit,
}: {
  audit: AuditInstanceSummary;
  onEdit: (audit: AuditInstanceSummary) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: audit.id,
  });
  const cfg = statusConfig[audit.status] || statusConfig.scheduled;
  const Icon = cfg.icon;

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "block p-2 rounded-lg border text-left hover:shadow-sm transition-all cursor-move",
        cfg.bg,
        cfg.border,
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", cfg.color)} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-medium truncate", cfg.color)}>
            {audit.template.name}
          </p>
          <p className="text-[10px] text-muted truncate">
            {audit.service.code} · QA{audit.template.qualityArea}
            {audit.complianceScore != null && ` · ${audit.complianceScore}%`}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(audit);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-0.5 rounded hover:bg-black/5"
          aria-label="Edit audit"
        >
          <Pencil className="w-3 h-3 text-muted" />
        </button>
      </div>
    </div>
  );
}

function DroppableMonth({
  month,
  children,
}: {
  month: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(month) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-colors rounded-xl",
        isOver && "ring-2 ring-brand/40",
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AuditCalendarTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [serviceFilter, setServiceFilter] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [showUploadCalendar, setShowUploadCalendar] = useState(false);
  const [showUploadDocuments, setShowUploadDocuments] = useState(false);

  const { data, isLoading } = useAuditInstances({
    year,
    serviceId: serviceFilter || undefined,
    qualityArea: qaFilter || undefined,
  });

  const reschedule = useRescheduleAudit();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAudit, setEditingAudit] = useState<AuditInstanceSummary | null>(null);
  const [editModalMonth, setEditModalMonth] = useState<number | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const auditId = String(active.id);
    const targetMonth = Number(over.id);
    if (!Number.isFinite(targetMonth) || targetMonth < 1 || targetMonth > 12) return;
    const audit = data?.instances.find((i) => i.id === auditId);
    if (!audit) return;
    if (audit.scheduledMonth === targetMonth && audit.scheduledYear === year) return;
    const dueDate = new Date(year, targetMonth - 1, 15).toISOString();
    reschedule.mutate({
      id: auditId,
      scheduledMonth: targetMonth,
      scheduledYear: year,
      dueDate,
    });
  };

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      // /api/services may return either `{ services: [...] }` or a bare array.
      const payload = await fetchApi<{ services?: ServiceOption[] } | ServiceOption[]>(
        "/api/services?limit=100",
      );
      return Array.isArray(payload) ? payload : payload.services ?? [];
    },
    staleTime: 60_000,
    retry: 2,
  });

  // Group instances by month
  const byMonth = useMemo(() => {
    const map: Record<number, AuditInstanceSummary[]> = {};
    for (let m = 1; m <= 12; m++) map[m] = [];
    if (data?.instances) {
      for (const inst of data.instances) {
        if (!map[inst.scheduledMonth]) map[inst.scheduledMonth] = [];
        map[inst.scheduledMonth].push(inst);
      }
    }
    return map;
  }, [data?.instances]);

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Scheduled", value: stats.scheduled, color: "text-blue-700 bg-blue-50" },
            { label: "In Progress", value: stats.in_progress, color: "text-amber-700 bg-amber-50" },
            { label: "Completed", value: stats.completed, color: "text-emerald-700 bg-emerald-50" },
            { label: "Overdue", value: stats.overdue, color: "text-red-700 bg-red-50" },
            {
              label: "Avg Score",
              value: stats.avgScore != null ? `${stats.avgScore}%` : "—",
              color: "text-brand bg-brand/5",
            },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl p-4 text-center", s.color)}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[4rem] text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        </div>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={qaFilter}
          onChange={(e) => setQaFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Quality Areas</option>
          {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
            <option key={qa} value={String(qa)}>
              QA{qa} — {qaLabels[qa]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setEditingAudit(null);
              setEditModalMonth(undefined);
              setEditModalOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-surface transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add Audit
          </button>
          <button
            onClick={() => setShowUploadDocuments(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-surface transition-colors"
          >
            <FileUp className="w-4 h-4" />
            Upload Audit Documents
          </button>
          <button
            onClick={() => setShowUploadCalendar(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand/90 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Calendar
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const audits = byMonth[month] || [];
              const isPast =
                year < now.getFullYear() ||
                (year === now.getFullYear() && month < now.getMonth() + 1);
              const isCurrent =
                year === now.getFullYear() && month === now.getMonth() + 1;

              return (
                <DroppableMonth key={month} month={month}>
                  <div
                    className={cn(
                      "rounded-xl border p-4 transition-colors h-full",
                      isCurrent
                        ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4
                        className={cn(
                          "text-sm font-semibold",
                          isCurrent ? "text-brand" : isPast ? "text-muted" : "text-foreground",
                        )}
                      >
                        {monthNames[month - 1]}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        {audits.length > 0 && (
                          <span className="text-xs font-medium text-muted bg-surface px-2 py-0.5 rounded-full">
                            {audits.length}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAudit(null);
                            setEditModalMonth(month);
                            setEditModalOpen(true);
                          }}
                          className="p-1 rounded hover:bg-surface"
                          aria-label={`Add audit to ${monthNames[month - 1]}`}
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-muted" />
                        </button>
                      </div>
                    </div>

                    {audits.length === 0 ? (
                      <p className="text-xs text-muted italic">No audits scheduled</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {audits.map((audit) => (
                          <DraggableAudit
                            key={audit.id}
                            audit={audit}
                            onEdit={(a) => {
                              setEditingAudit(a);
                              setEditModalMonth(a.scheduledMonth);
                              setEditModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </DroppableMonth>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* Upload Calendar Dialog */}
      <UploadCalendarDialog
        open={showUploadCalendar}
        onClose={() => setShowUploadCalendar(false)}
        currentYear={year}
      />

      {/* Upload Audit Documents Dialog */}
      <UploadAuditDocumentsDialog
        open={showUploadDocuments}
        onClose={() => setShowUploadDocuments(false)}
      />

      {/* Add / Edit Audit Modal */}
      <AuditEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        year={year}
        month={editModalMonth}
        editing={editingAudit}
      />
    </div>
  );
}
