"use client";

/**
 * ServiceIncidentsTab — log + browse safety incidents for a single service.
 *
 * Shipped 2026-04-30 in response to training feedback that Director of
 * Service / Educators had no in-service surface to log incidents — they
 * had to leave the service detail page entirely and visit the cross-
 * service /incidents page (which is now hidden from member/staff anyway).
 *
 * Mirrors the ServiceReflectionsTab pattern: list view, filter bar,
 * create dialog, kebab menu with edit/delete gated to the original
 * reporter or owner/admin (delete-restriction matches the documents
 * pattern — head_office is intentionally NOT in the admin set so they
 * can't quietly modify reports filed by other staff).
 */

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus,
  AlertTriangle,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/ui/v2/FilterBar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import {
  useIncidents,
  useCreateIncident,
  useUpdateIncident,
  useDeleteIncident,
  type IncidentRecord,
} from "@/hooks/useIncidents";

const INCIDENT_TYPES = [
  { value: "injury", label: "Injury" },
  { value: "illness", label: "Illness" },
  { value: "behaviour", label: "Behaviour" },
  { value: "missing_child", label: "Missing Child" },
  { value: "near_miss", label: "Near Miss" },
  { value: "medication_error", label: "Medication Error" },
  { value: "property_damage", label: "Property Damage" },
  { value: "complaint", label: "Complaint" },
];

const SEVERITY_LEVELS = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "reportable", label: "Reportable" },
  { value: "serious", label: "Serious" },
];

const LOCATIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "playground", label: "Playground" },
  { value: "transition", label: "Transition" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
];

const TIMES_OF_DAY = [
  { value: "arrival", label: "Arrival" },
  { value: "programme", label: "Programme" },
  { value: "meal_time", label: "Meal Time" },
  { value: "packdown", label: "Packdown" },
  { value: "departure", label: "Departure" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...INCIDENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
];
const SEVERITY_FILTER_OPTIONS = [
  { value: "all", label: "All severities" },
  ...SEVERITY_LEVELS.map((s) => ({ value: s.value, label: s.label })),
];

const SEVERITY_BADGE: Record<string, string> = {
  minor: "bg-surface text-foreground/80",
  moderate: "bg-yellow-100 text-yellow-800",
  reportable: "bg-orange-100 text-orange-800",
  serious: "bg-red-100 text-red-800",
};

function formatLabel(v: string): string {
  return v.split("_").map((p) => p[0]?.toUpperCase() + p.slice(1)).join(" ");
}

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ServiceIncidentsTab({ serviceId }: { serviceId: string }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentRecord | null>(null);

  const { data: session } = useSession();
  const userId = session?.user?.id;
  const role = session?.user?.role;
  const isAdminLike = role === "owner" || role === "admin";

  const filters = useMemo(
    () => ({
      serviceId,
      type: typeFilter !== "all" ? typeFilter : undefined,
      severity: severityFilter !== "all" ? severityFilter : undefined,
    }),
    [serviceId, typeFilter, severityFilter],
  );

  const { data, isLoading } = useIncidents(filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Incidents
        </h2>
        <BrandButton onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Log incident
        </BrandButton>
      </div>

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: TYPE_FILTER_OPTIONS },
          { key: "severity", label: "Severity", options: SEVERITY_FILTER_OPTIONS },
        ]}
        values={{ type: typeFilter, severity: severityFilter }}
        onChange={(k, v) => {
          if (k === "type") setTypeFilter(v);
          if (k === "severity") setSeverityFilter(v);
        }}
        onReset={() => {
          setTypeFilter("all");
          setSeverityFilter("all");
        }}
      />

      {isLoading ? (
        <div className="text-sm text-[color:var(--color-muted)] py-6">
          Loading incidents…
        </div>
      ) : !data?.incidents || data.incidents.length === 0 ? (
        <EmptyIncidents onCreate={() => setCreateOpen(true)} />
      ) : (
        <ul className="space-y-2">
          {data.incidents.map((i) => {
            const canManage = isAdminLike || i.createdBy?.id === userId;
            return (
              <IncidentCard
                key={i.id}
                incident={i}
                canManage={canManage}
                onEdit={() => setEditing(i)}
              />
            );
          })}
        </ul>
      )}

      {createOpen && (
        <IncidentDialog
          mode="create"
          serviceId={serviceId}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editing && (
        <IncidentDialog
          mode="edit"
          serviceId={serviceId}
          incident={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmptyIncidents({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
        "border border-dashed border-[color:var(--color-border)] p-8 text-center",
      )}
    >
      <AlertTriangle className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        No incidents logged for this service
      </p>
      <p className="text-xs text-[color:var(--color-muted)] mt-1 mb-4">
        Logging near-misses early is the cheapest way to spot patterns
        before they turn into something serious.
      </p>
      <BrandButton onClick={onCreate}>Log your first incident</BrandButton>
    </div>
  );
}

function BrandButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
        "min-h-[44px]",
        "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
        "hover:bg-[color:var(--color-brand-hover)] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function IncidentCard({
  incident,
  canManage,
  onEdit,
}: {
  incident: IncidentRecord;
  canManage: boolean;
  onEdit: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useDeleteIncident();
  const date = new Date(incident.incidentDate);
  return (
    <li
      className={cn(
        "warm-card-dense p-3",
        "border border-[color:var(--color-border)]",
      )}
    >
      <header className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--color-brand)]">
              {formatLabel(incident.incidentType)}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)]",
                SEVERITY_BADGE[incident.severity] ?? "bg-surface text-foreground/80",
              )}
            >
              {formatLabel(incident.severity)}
            </span>
            <span className="text-[11px] text-[color:var(--color-muted)]">
              {incident.createdBy?.name ?? "Unknown"} ·{" "}
              {date.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mt-0.5">
            {incident.childName ?? "(no child named)"}
          </h3>
        </div>

        {canManage && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowMenu((s) => !s)}
              className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-foreground)] transition-colors"
              aria-label="Incident actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 bg-[color:var(--color-cream-deep)] border border-[color:var(--color-border)] rounded-[var(--radius-sm)] shadow-lg py-1 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface)] flex items-center gap-2 min-h-[44px]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-[color:var(--color-surface)] flex items-center gap-2 min-h-[44px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <p className="text-[13px] text-[color:var(--color-foreground)]/80 whitespace-pre-wrap">
        {incident.description}
      </p>

      {(incident.location || incident.timeOfDay) && (
        <div className="mt-2 flex gap-1 flex-wrap text-[11px] text-[color:var(--color-muted)]">
          {incident.location && <span>📍 {formatLabel(incident.location)}</span>}
          {incident.timeOfDay && <span>· 🕒 {formatLabel(incident.timeOfDay)}</span>}
        </div>
      )}

      {(incident.parentNotified || incident.reportableToAuthority || incident.followUpRequired) && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {incident.parentNotified && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-emerald-100 text-emerald-800">
              Parent notified
            </span>
          )}
          {incident.reportableToAuthority && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-rose-100 text-rose-800">
              Reportable
            </span>
          )}
          {incident.followUpRequired && !incident.followUpCompleted && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-amber-100 text-amber-800">
              Follow-up due
            </span>
          )}
        </div>
      )}

      {confirmDelete && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmDelete(false); }}>
          <DialogContent>
            <DialogTitle className="text-base font-semibold text-[color:var(--color-foreground)] mb-2">
              Delete this incident?
            </DialogTitle>
            <p className="text-sm text-[color:var(--color-muted)] mb-4">
              The {formatLabel(incident.incidentType).toLowerCase()} entry from{" "}
              {date.toLocaleDateString()} will be removed. This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={del.isPending}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await del.mutateAsync({ incidentId: incident.id });
                  setConfirmDelete(false);
                }}
                disabled={del.isPending}
                className={cn(
                  "min-h-[44px] px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium",
                  "bg-rose-600 text-white hover:bg-rose-700 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

/**
 * Unified create/edit dialog. Same component prevents drift between the
 * two flows — see the comment on ReflectionDialog for the rationale.
 */
function IncidentDialog({
  mode,
  serviceId,
  incident,
  onClose,
}: {
  mode: "create" | "edit";
  serviceId: string;
  incident?: IncidentRecord;
  onClose: () => void;
}) {
  const create = useCreateIncident();
  const update = useUpdateIncident();

  const [incidentDate, setIncidentDate] = useState(
    incident
      ? new Date(incident.incidentDate).toISOString().split("T")[0]
      : todayDateInputValue(),
  );
  const [childName, setChildName] = useState(incident?.childName ?? "");
  const [incidentType, setIncidentType] = useState(incident?.incidentType ?? INCIDENT_TYPES[0].value);
  const [severity, setSeverity] = useState(incident?.severity ?? SEVERITY_LEVELS[0].value);
  const [location, setLocation] = useState(incident?.location ?? "");
  const [timeOfDay, setTimeOfDay] = useState(incident?.timeOfDay ?? "");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [actionTaken, setActionTaken] = useState(incident?.actionTaken ?? "");
  const [parentNotified, setParentNotified] = useState(!!incident?.parentNotified);
  const [reportableToAuthority, setReportableToAuthority] = useState(
    !!incident?.reportableToAuthority,
  );
  const [followUpRequired, setFollowUpRequired] = useState(!!incident?.followUpRequired);

  const valid =
    incidentDate.trim().length > 0 &&
    incidentType.length > 0 &&
    severity.length > 0 &&
    description.trim().length > 0;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!valid) return;
    if (mode === "edit" && incident) {
      await update.mutateAsync({
        incidentId: incident.id,
        incidentDate,
        childName: childName.trim() || null,
        incidentType,
        severity,
        location: location || null,
        timeOfDay: timeOfDay || null,
        description: description.trim(),
        actionTaken: actionTaken.trim() || null,
        parentNotified,
        reportableToAuthority,
        followUpRequired,
      });
      toast({ description: "Incident updated" });
    } else {
      await create.mutateAsync({
        serviceId,
        incidentDate,
        childName: childName.trim() || undefined,
        incidentType,
        severity,
        location: location || undefined,
        timeOfDay: timeOfDay || undefined,
        description: description.trim(),
        actionTaken: actionTaken.trim() || undefined,
        parentNotified,
        reportableToAuthority,
        followUpRequired,
      });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold text-[color:var(--color-foreground)] mb-4">
          {mode === "edit" ? "Edit incident" : "Log new incident"}
        </DialogTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <input
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              />
            </Field>
            <Field label="Child (optional)">
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Sarah J."
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              >
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Location (optional)">
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              >
                <option value="">—</option>
                {LOCATIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time of day (optional)">
              <select
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              >
                <option value="">—</option>
                {TIMES_OF_DAY.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="What happened">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Factual description — who, what, where, when."
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
            />
          </Field>

          <Field label="Action taken (optional)">
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={3}
              placeholder="First aid given, supervision changes, parent notified, etc."
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <CheckboxRow
              label="Parent notified"
              checked={parentNotified}
              onChange={setParentNotified}
            />
            <CheckboxRow
              label="Reportable to regulator"
              checked={reportableToAuthority}
              onChange={setReportableToAuthority}
            />
            <CheckboxRow
              label="Follow-up required"
              checked={followUpRequired}
              onChange={setFollowUpRequired}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <BrandButton onClick={submit} disabled={!valid || pending}>
              {pending
                ? "Saving…"
                : mode === "edit"
                  ? "Save changes"
                  : "Log incident"}
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-[color:var(--color-border)]"
      />
      {label}
    </label>
  );
}
