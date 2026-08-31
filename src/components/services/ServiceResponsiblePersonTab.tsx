"use client";

/**
 * ServiceResponsiblePersonTab — the per-service responsible-person register.
 *
 * Renders a screenshot-ready weekly grid (weekdays × BSC/ASC/VC) of the
 * single designated responsible person per session, with an assign dialog
 * (pick a staff member OR type a name for backfill) and a branded,
 * range-capable PDF export for the Department of Education.
 *
 * Lives alongside the roster as a third sub-pill in ServiceWeeklyRosterTab.
 *
 * 2026-06-11: introduced after an Assessment & Rating breach finding
 * (no responsible person rostered, no record kept).
 */

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, FileDown, X, UserPlus } from "lucide-react";
import {
  useResponsiblePersonRegister,
  useSetResponsiblePerson,
  useClearResponsiblePerson,
  type RpEntry,
} from "@/hooks/useResponsiblePerson";
import { useTeam, type TeamMember } from "@/hooks/useTeam";
import {
  RP_SESSION_TYPES,
  RP_SESSION_SHORT,
  RP_SESSION_LABELS,
  DEFAULT_SESSION_TIMES,
  cellKey,
  indexEntriesByCell,
  type RpSessionType,
} from "@/lib/responsible-person";
import {
  generateResponsiblePersonPdf,
  type RpPdfRow,
} from "@/lib/responsible-person-pdf";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { isAdminRole } from "@/lib/role-permissions";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn, getWeekStart, toLocalIsoDate } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";

interface ServiceResponsiblePersonTabProps {
  serviceId: string;
  serviceName?: string;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// Logical session order for sorting PDF rows (the API orders sessionType
// alphabetically, which would put ASC before BSC).
const SESSION_ORDER: Record<RpSessionType, number> = { bsc: 0, asc: 1, vc: 2 };

/** Friendly position titles prefilled when a staff member is picked. */
const ROLE_TITLES: Record<string, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Administrator",
  marketing: "Marketing",
  member: "Director of Service",
  staff: "Educator",
};

function getMondayIso(offsetWeeks: number): string {
  const monday = getWeekStart();
  monday.setDate(monday.getDate() + offsetWeeks * 7);
  return toLocalIsoDate(monday);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(mondayIso: string): string {
  const monday = new Date(`${mondayIso}T00:00:00.000Z`);
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  };
  return `${monday.toLocaleDateString("en-AU", opts)} – ${friday.toLocaleDateString(
    "en-AU",
    { ...opts, year: "numeric" },
  )}`;
}

function todayIso(): string {
  return toLocalIsoDate(new Date());
}

export function ServiceResponsiblePersonTab({
  serviceId,
  serviceName,
}: ServiceResponsiblePersonTabProps) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const sessionServiceId =
    (session?.user as { serviceId?: string | null } | undefined)?.serviceId ??
    null;
  const canEdit =
    isAdminRole(role) || (role === "member" && sessionServiceId === serviceId);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => getMondayIso(weekOffset), [weekOffset]);
  const weekDates = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );
  const from = weekDates[0];
  const to = weekDates[4];

  const { data, isLoading, error } = useResponsiblePersonRegister(
    serviceId,
    from,
    to,
  );

  const entriesByCell = useMemo(
    () => indexEntriesByCell(data?.entries ?? []),
    [data],
  );

  // Active staff at this service — the assign picker's options.
  const { data: team } = useTeam({ service: serviceId });
  const staffOptions = useMemo<TeamMember[]>(() => {
    if (!team) return [];
    return team.filter((m) => {
      const atService = m.service?.id === serviceId;
      const active = (m as { active?: boolean }).active !== false;
      return atService && active;
    });
  }, [team, serviceId]);

  const [assignTarget, setAssignTarget] = useState<{
    date: string;
    sessionType: RpSessionType;
    existing: RpEntry | null;
  } | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header: week nav + export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronLeft className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p - 1)}
            aria-label="Previous week"
          />
          <span className="text-sm font-medium text-foreground min-w-[200px] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronRight className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p + 1)}
            aria-label="Next week"
          />
          {weekOffset !== 0 && (
            <Button size="xs" variant="ghost" onClick={() => setWeekOffset(0)}>
              Today
            </Button>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          iconLeft={<FileDown className="w-4 h-4" />}
          onClick={() => setPdfOpen(true)}
        >
          Download register (PDF)
        </Button>
      </div>

      {/* Intro note — what this register is for. */}
      <p className="text-xs text-muted">
        One designated <strong className="text-foreground">responsible person working directly with children</strong>{" "}
        per session (NQF). {canEdit ? "Tap a cell to assign or change." : "View only."}
      </p>

      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border border-border bg-surface text-xs font-semibold uppercase tracking-wide text-muted min-w-[120px]">
                  Day
                </th>
                {RP_SESSION_TYPES.map((st) => (
                  <th
                    key={st}
                    className="text-left p-2 border border-border bg-surface text-xs font-semibold text-muted min-w-[200px]"
                  >
                    {RP_SESSION_SHORT[st]}{" "}
                    <span className="font-normal opacity-70">
                      · {RP_SESSION_LABELS[st]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((date, i) => {
                const isToday = date === todayIso();
                const d = new Date(`${date}T00:00:00.000Z`);
                return (
                  <tr key={date}>
                    <td
                      className={cn(
                        "p-2 border border-border align-top",
                        isToday ? "bg-brand/5" : "",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            isToday ? "text-brand" : "text-foreground",
                          )}
                        >
                          {WEEKDAY_NAMES[i]}
                        </span>
                        <span className="text-xs text-muted">
                          {d.getUTCDate()}/{d.getUTCMonth() + 1}
                        </span>
                      </div>
                    </td>
                    {RP_SESSION_TYPES.map((st) => {
                      const entry = entriesByCell[cellKey(date, st)] ?? null;
                      return (
                        <td
                          key={st}
                          className={cn(
                            "p-1.5 border border-border align-top",
                            canEdit && "cursor-pointer hover:bg-surface/60",
                          )}
                          onClick={
                            canEdit
                              ? () =>
                                  setAssignTarget({
                                    date,
                                    sessionType: st,
                                    existing: entry,
                                  })
                              : undefined
                          }
                          data-testid={`rp-cell-${date}-${st}`}
                        >
                          {entry ? (
                            <RpCell entry={entry} />
                          ) : (
                            <div className="min-h-[40px] flex items-center text-xs text-muted/70">
                              {canEdit ? (
                                <span className="inline-flex items-center gap-1">
                                  <UserPlus className="w-3 h-3" /> Assign
                                </span>
                              ) : (
                                "—"
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {assignTarget && (
        <AssignRpDialog
          serviceId={serviceId}
          date={assignTarget.date}
          sessionType={assignTarget.sessionType}
          existing={assignTarget.existing}
          staffOptions={staffOptions}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {pdfOpen && (
        <ExportPdfDialog
          serviceId={serviceId}
          serviceName={serviceName ?? "Service"}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setPdfOpen(false)}
        />
      )}
    </div>
  );
}

// ── Cell ────────────────────────────────────────────────────────────────

function RpCell({ entry }: { entry: RpEntry }) {
  return (
    <div className="min-h-[40px]">
      <div className="text-sm font-medium text-foreground leading-tight">
        {entry.personName}
      </div>
      {entry.personRole && (
        <div className="text-xs text-muted leading-tight">
          {entry.personRole}
        </div>
      )}
      <div className="text-xs text-muted/80 mt-0.5">
        {entry.startTime}–{entry.endTime}
      </div>
    </div>
  );
}

// ── Assign / edit dialog ─────────────────────────────────────────────────

const INPUT_CLS =
  "w-full rounded-md border border-border px-3 py-2 text-sm bg-background";

function AssignRpDialog({
  serviceId,
  date,
  sessionType,
  existing,
  staffOptions,
  onClose,
}: {
  serviceId: string;
  date: string;
  sessionType: RpSessionType;
  existing: RpEntry | null;
  staffOptions: TeamMember[];
  onClose: () => void;
}) {
  useEscapeClose(onClose);
  const defaults = DEFAULT_SESSION_TIMES[sessionType];
  const [userId, setUserId] = useState<string>(existing?.userId ?? "");
  const [personName, setPersonName] = useState<string>(
    existing?.personName ?? "",
  );
  const [personRole, setPersonRole] = useState<string>(
    existing?.personRole ?? "",
  );
  const [startTime, setStartTime] = useState<string>(
    existing?.startTime ?? defaults.start,
  );
  const [endTime, setEndTime] = useState<string>(
    existing?.endTime ?? defaults.end,
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");

  const setRp = useSetResponsiblePerson(serviceId);
  const clearRp = useClearResponsiblePerson(serviceId);
  const busy = setRp.isPending || clearRp.isPending;

  function handlePickStaff(id: string) {
    setUserId(id);
    if (!id) return;
    const m = staffOptions.find((s) => s.id === id);
    if (m) {
      setPersonName(m.name);
      setPersonRole(ROLE_TITLES[m.role] ?? "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personName.trim()) {
      toast({
        variant: "destructive",
        description: "Enter the responsible person's name.",
      });
      return;
    }
    if (!startTime || !endTime || endTime <= startTime) {
      toast({
        variant: "destructive",
        description: "End time must be after start time.",
      });
      return;
    }
    try {
      await setRp.mutateAsync({
        date,
        sessionType,
        personName: personName.trim(),
        personRole: personRole.trim() || null,
        userId: userId || null,
        startTime,
        endTime,
        notes: notes.trim() || null,
      });
      toast({ description: "Responsible person recorded." });
      onClose();
    } catch {
      // onError toast handled in the hook.
    }
  }

  async function handleClear() {
    if (!existing) return;
    if (!window.confirm("Clear the designated responsible person for this session?"))
      return;
    try {
      await clearRp.mutateAsync(existing.id);
      toast({ description: "Designation cleared." });
      onClose();
    } catch {
      // onError toast handled in the hook.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 rounded-xl bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {existing ? "Edit" : "Assign"} responsible person
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {RP_SESSION_LABELS[sessionType]} ·{" "}
              {new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label htmlFor="rp-staff" className="block text-sm font-medium mb-1">
              Staff member
            </label>
            <select
              id="rp-staff"
              value={userId}
              onChange={(e) => handlePickStaff(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Not a system user — type below…</option>
              {staffOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rp-name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="rp-name"
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="Full name of the responsible person"
              className={INPUT_CLS}
              required
            />
          </div>

          <div>
            <label htmlFor="rp-role" className="block text-sm font-medium mb-1">
              Position / role
            </label>
            <input
              id="rp-role"
              type="text"
              value={personRole}
              onChange={(e) => setPersonRole(e.target.value)}
              placeholder="e.g. Director of Service"
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rp-start" className="block text-sm font-medium mb-1">
                On (start)
              </label>
              <input
                id="rp-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <label htmlFor="rp-end" className="block text-sm font-medium mb-1">
                Off (end)
              </label>
              <input
                id="rp-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={INPUT_CLS}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="rp-notes" className="block text-sm font-medium mb-1">
              Notes (optional)
            </label>
            <input
              id="rp-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. covering for…"
              className={INPUT_CLS}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {existing ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleClear}
                disabled={busy}
              >
                {clearRp.isPending ? "Clearing…" : "Clear"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-surface"
              >
                Cancel
              </button>
              <Button type="submit" size="sm" disabled={busy}>
                {setRp.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PDF export dialog ────────────────────────────────────────────────────

function ExportPdfDialog({
  serviceId,
  serviceName,
  defaultFrom,
  defaultTo,
  onClose,
}: {
  serviceId: string;
  serviceName: string;
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    if (to < from) {
      toast({
        variant: "destructive",
        description: "The 'to' date must be on or after the 'from' date.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetchApi<{ entries: RpEntry[] }>(
        `/api/services/${serviceId}/responsible-person?from=${from}&to=${to}`,
      );
      const rows: RpPdfRow[] = (res.entries ?? [])
        .map((e) => ({
          date: e.date.slice(0, 10),
          sessionType: e.sessionType,
          personName: e.personName,
          personRole: e.personRole,
          startTime: e.startTime,
          endTime: e.endTime,
        }))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            SESSION_ORDER[a.sessionType] - SESSION_ORDER[b.sessionType],
        );

      const doc = await generateResponsiblePersonPdf({
        serviceName,
        from,
        to,
        rows,
        generatedAt: new Date().toISOString(),
      });
      const safeName = serviceName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      doc.save(`responsible-person-register-${safeName}-${from}_${to}.pdf`);
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Could not generate the PDF.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm mx-4 rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            Download register
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleDownload} className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted">
            Export a branded PDF of the responsible-person register for any date
            range — e.g. the full backfill span for the Department.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rp-pdf-from" className="block text-sm font-medium mb-1">
                From
              </label>
              <input
                id="rp-pdf-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <label htmlFor="rp-pdf-to" className="block text-sm font-medium mb-1">
                To
              </label>
              <input
                id="rp-pdf-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={INPUT_CLS}
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-surface"
            >
              Cancel
            </button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
