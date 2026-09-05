"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRosterShifts, type RosterShiftListItem } from "@/hooks/useRosterShifts";
import { useRoster } from "@/hooks/useRoster";
import { useServiceStaff } from "@/hooks/useServiceStaff";
import { useRosterOverlays } from "@/hooks/useRosterOverlays";
import { useRosterCost } from "@/hooks/useRosterCost";
import { computeRatio } from "@/lib/roster-ratio";
import {
  useStaffCertStatus,
  type CertStatus,
  type UserCertStatus,
} from "@/hooks/useServiceStaffCertificates";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ShiftChip, type ShiftChipShift } from "@/components/roster/ShiftChip";
import {
  WeekPicker,
  addDaysIso,
  currentWeekStartIso,
  parseIsoDateLocal,
} from "@/components/roster/WeekPicker";
import { RatioBadge } from "@/components/roster/RatioBadge";
import { ShiftEditModal } from "@/components/roster/ShiftEditModal";
import { ShiftSwapDialog } from "@/components/roster/ShiftSwapDialog";
import { ShiftTemplatesPanel } from "@/components/roster/ShiftTemplatesPanel";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { isAdminRole } from "@/lib/role-permissions";
import { toast } from "@/hooks/useToast";
import { cn, toLocalIsoDate } from "@/lib/utils";

interface ServiceWeeklyShiftsGridProps {
  serviceId: string;
  serviceName?: string;
  /**
   * Controlled week (Monday `YYYY-MM-DD`). When provided the grid renders
   * that week and drops its internal week state — the `/roster` command
   * centre drives many grids from a single page-level WeekPicker this way.
   * When absent the grid keeps its own state (service-detail tab).
   */
  weekStart?: string;
  /**
   * Week-change callback for controlled mode. When provided alongside
   * `weekStart`, the grid still renders its own WeekPicker and delegates
   * navigation here; when `weekStart` is given WITHOUT this, the picker is
   * hidden entirely (the parent owns navigation).
   */
  onWeekChange?: (weekStart: string) => void;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SESSION_TYPES = ["bsc", "asc", "vc"] as const;
const SESSION_LABELS: Record<(typeof SESSION_TYPES)[number], string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function dateIso(date: string | Date): string {
  // toLocalIsoDate, not toISOString().split — serialising a local-time Date
  // through UTC shifts the calendar day back in AEST/AEDT (the "Monday
  // column shows nothing" bug).
  return toLocalIsoDate(typeof date === "string" ? new Date(date) : date);
}

type ModalState =
  | { mode: "create"; date: string }
  | { mode: "edit"; shift: RosterShiftListItem }
  | null;

export function ServiceWeeklyShiftsGrid({
  serviceId,
  serviceName,
  weekStart: weekStartProp,
  onWeekChange,
}: ServiceWeeklyShiftsGridProps) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  const canEdit =
    isAdminRole(role) || (role === "member" && sessionServiceId === serviceId);

  // Week state: internal by default; controlled when a `weekStart` prop is
  // provided (see the props doc-comment).
  const [internalWeekStart, setInternalWeekStart] = useState(currentWeekStartIso);
  const weekStart = weekStartProp ?? internalWeekStart;
  const handleWeekChange = onWeekChange ?? setInternalWeekStart;
  const showWeekPicker = weekStartProp === undefined || onWeekChange !== undefined;

  const weekDates = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = parseIsoDateLocal(weekStart);
      d.setDate(d.getDate() + i);
      // toLocalIsoDate, not toISOString().split — see dateIso() above.
      return toLocalIsoDate(d);
    });
  }, [weekStart]);

  const {
    data: shiftsData,
    isLoading: shiftsLoading,
    error: shiftsError,
    refetch,
  } = useRosterShifts(serviceId, weekStart);

  // Staff source (staff-portal-v2 Chunk 5, Task 5.5): the per-service staff
  // endpoint — primary users PLUS active UserServiceMembership rows — so
  // cross-centre staff appear in the grid. Replaces useTeam, which only knew
  // primary assignments (and fetched the whole org). Shares its query cache
  // with ShiftEditModal (["service-staff", serviceId]).
  const { data: staffData, isLoading: staffLoading } = useServiceStaff(serviceId);
  // 2026-05-02: pull child bookings for the same week so the ratio row
  // can show real numerators (PR #50).
  const { data: rosterData } = useRoster(serviceId, weekStart);
  // 2026-05-02: pull the wage-cost projection so we can show a "≈ $X
  // this week" chip up top. Hidden when the projection returns zero
  // hours (an empty week).
  const { data: costData } = useRosterCost(serviceId, weekStart);
  // 2026-05-02: roll up each staff member's compliance certs against the
  // last day of the visible week. The grid flags a red shield next to
  // anyone whose cert has already expired by week-end, and an amber shield
  // for anyone with a cert expiring within 30 days.
  const weekFriday = useMemo(() => {
    const d = parseIsoDateLocal(weekStart);
    d.setDate(d.getDate() + 4);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [weekStart]);
  const { rollup: certStatusByUser } = useStaffCertStatus(serviceId, weekFriday);

  const staff = useMemo(() => {
    if (!staffData) return [];
    // Map userId → id: the grid keys rows/cells on `id` (a User id) and the
    // staff endpoint is already service-scoped, so only the active filter
    // is needed here.
    return staffData.members
      .filter((m) => m.isActive)
      .map((m) => ({ id: m.userId, name: m.name, avatar: m.avatar }));
  }, [staffData]);

  // Roster overlays (Tasks 5.4 + 10.2) — approved internal leave chips and
  // recurring "Unavailable" hints in ONE batched fetch, keyed on the visible
  // staff's userIds, never serviceId (nullable on LeaveRequest).
  const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);
  const { data: overlayData } = useRosterOverlays(
    staffIds,
    weekDates[0],
    weekDates[weekDates.length - 1],
  );
  const leaveByUserAndDay = useMemo(() => {
    const out: Record<string, Record<string, { isHalfDay: boolean }>> = {};
    for (const entry of overlayData?.leave ?? []) {
      // @db.Date fields serialise as midnight-UTC ISO strings — slice(0,10)
      // is the calendar date, comparable lexicographically with weekDates.
      const start = entry.startDate.slice(0, 10);
      const end = entry.endDate.slice(0, 10);
      for (const day of weekDates) {
        if (day < start || day > end) continue;
        if (!out[entry.userId]) out[entry.userId] = {};
        // A full-day entry wins over a half-day one on the same date.
        const existing = out[entry.userId][day];
        out[entry.userId][day] = {
          isHalfDay: (existing?.isHalfDay ?? true) && entry.isHalfDay,
        };
      }
    }
    return out;
  }, [overlayData, weekDates]);

  // Recurring unavailability hint (Task 10.2): userId → weekday(0-6) set.
  // Weekday-keyed (repeats every week), unlike the date-keyed leave overlay.
  const unavailableByUser = useMemo(() => {
    const out: Record<string, Set<number>> = {};
    for (const entry of overlayData?.availability ?? []) {
      if (!out[entry.userId]) out[entry.userId] = new Set();
      out[entry.userId].add(entry.weekday);
    }
    return out;
  }, [overlayData]);

  // Build grid: userId → dateIso → shifts[]. Null-userId shifts are OPEN
  // shifts — they get their own pinned row above the staff rows instead of
  // being silently dropped (staff-portal-v2 Chunk 5, Task 5.2).
  const { shiftsByUserAndDay, openShiftsByDay, openShiftCount } = useMemo(() => {
    const byUser: Record<string, Record<string, RosterShiftListItem[]>> = {};
    const open: Record<string, RosterShiftListItem[]> = {};
    let openCount = 0;
    for (const shift of shiftsData?.shifts ?? []) {
      const key = dateIso(shift.date);
      if (!shift.userId) {
        if (!open[key]) open[key] = [];
        open[key].push(shift);
        openCount++;
        continue;
      }
      if (!byUser[shift.userId]) byUser[shift.userId] = {};
      if (!byUser[shift.userId][key]) byUser[shift.userId][key] = [];
      byUser[shift.userId][key].push(shift);
    }
    return { shiftsByUserAndDay: byUser, openShiftsByDay: open, openShiftCount: openCount };
  }, [shiftsData]);

  // Per-day × session-type rostered staff count (for ratio badges)
  const ratioCountsByDay = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const dateKey of weekDates) {
      out[dateKey] = { bsc: 0, asc: 0, vc: 0 };
    }
    for (const shift of shiftsData?.shifts ?? []) {
      // LOCKED decision (plan Task 5.2): open shifts (userId null) are
      // visible in the grid but must NOT count toward the ratio numerator —
      // an unfilled slot doesn't supervise children, and counting it would
      // make a cell look compliant while it still needs a person.
      if (!shift.userId) continue;
      const key = dateIso(shift.date);
      if (!out[key]) continue;
      const st = shift.sessionType;
      if (st in out[key]) {
        out[key][st] = (out[key][st] ?? 0) + 1;
      }
    }
    return out;
  }, [shiftsData, weekDates]);

  // Per-day × session-type child-booking count (the ratio denominator).
  // useRoster returns dateString → sessionType → RosterChild[]. We just
  // count length per cell — no need to reshape.
  const childrenCountsByDay = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const dateKey of weekDates) {
      out[dateKey] = { bsc: 0, asc: 0, vc: 0 };
    }
    if (rosterData) {
      for (const dateKey of weekDates) {
        const dayBlock = rosterData[dateKey];
        if (!dayBlock) continue;
        for (const st of SESSION_TYPES) {
          out[dateKey][st] = dayBlock[st]?.length ?? 0;
        }
      }
    }
    return out;
  }, [rosterData, weekDates]);

  // Roll up actual breaches across the week so we can surface a single
  // banner at the top instead of forcing the user to scan 15 cells. A
  // "breach" comes back from computeRatio when the cell is over the
  // 1:13 NQF guideline; "warning" is near-the-limit (>= 85%).
  const ratioSummary = useMemo(() => {
    const breaches: { dateKey: string; sessionType: string; staff: number; children: number }[] = [];
    const warnings: { dateKey: string; sessionType: string; staff: number; children: number }[] = [];
    for (const dateKey of weekDates) {
      for (const st of SESSION_TYPES) {
        const staff = ratioCountsByDay[dateKey]?.[st] ?? 0;
        const children = childrenCountsByDay[dateKey]?.[st] ?? 0;
        const r = computeRatio(staff, children);
        if (r.status === "breach") breaches.push({ dateKey, sessionType: st, staff, children });
        else if (r.status === "warning") warnings.push({ dateKey, sessionType: st, staff, children });
      }
    }
    return { breaches, warnings };
  }, [ratioCountsByDay, childrenCountsByDay, weekDates]);

  const [modalState, setModalState] = useState<ModalState>(null);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [swapDialogShift, setSwapDialogShift] =
    useState<{
      id: string;
      serviceId: string;
      date: string;
      shiftStart: string;
      shiftEnd: string;
    } | null>(null);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/roster/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, weekStart }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Publish failed");
      }
      const result = (await res.json()) as {
        publishedCount: number;
        notificationsSent: number;
      };
      toast({
        description: `Published ${result.publishedCount} shifts. Notified ${result.notificationsSent} staff.`,
      });
      await refetch();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Publish failed",
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyLastWeek = async () => {
    // addDaysIso works in local time — toISOString().split here shifted the
    // source week back a day in AEST/AEDT.
    const sourceWeekStart = addDaysIso(weekStart, -7);
    setCopying(true);
    try {
      const res = await fetch("/api/roster/copy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          sourceWeekStart,
          targetWeekStart: weekStart,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Copy failed");
      }
      const result = (await res.json()) as {
        created: number;
        replaced: number;
        skipped: unknown[];
      };
      toast({
        description: `Copied: ${result.created} new, ${result.replaced} replaced, ${result.skipped.length} skipped.`,
      });
      await refetch();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Copy failed",
      });
    } finally {
      setCopying(false);
    }
  };

  const isLoading = shiftsLoading || staffLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {showWeekPicker && (
            <WeekPicker weekStart={weekStart} onWeekChange={handleWeekChange} />
          )}
          {costData && costData.totalHours > 0 && (
            <RosterCostChip
              totalHours={costData.totalHours}
              totalCost={costData.totalCost}
              unpricedHours={costData.unpricedHours}
            />
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setTemplatesOpen(true)}
              disabled={copying || publishing}
            >
              Templates
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyLastWeek}
              loading={copying}
              disabled={copying || publishing}
            >
              Copy last week
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handlePublish}
              loading={publishing}
              disabled={publishing || copying}
            >
              Publish
            </Button>
          </div>
        )}
      </div>

      {/* Ratio summary banner — surface breaches + warnings at the top
          so educators don't have to eyeball 15 cells in the footer.
          2026-05-02: introduced once the real childrenCount got wired in;
          previously this would have always been "0 breaches" because
          children count was hardcoded to 0. */}
      {(ratioSummary.breaches.length > 0 || ratioSummary.warnings.length > 0) && (
        <RatioSummaryBanner
          breaches={ratioSummary.breaches}
          warnings={ratioSummary.warnings}
        />
      )}

      {/* Grid */}
      {shiftsError ? (
        <ErrorState error={shiftsError} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          No active staff assigned to {serviceName ?? "this service"}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="min-w-full border-collapse"
            aria-label={serviceName ? `${serviceName} weekly roster` : "Weekly roster"}
          >
            <thead>
              <tr>
                <th className="text-left p-2 border border-border bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
                  Staff
                </th>
                {weekDates.map((dateStr, i) => {
                  const d = new Date(dateStr);
                  const isToday = dateStr === toLocalIsoDate(new Date());
                  return (
                    <th
                      key={dateStr}
                      className={cn(
                        "text-left p-2 border border-border bg-surface text-xs font-semibold",
                        isToday ? "text-brand" : "text-muted",
                      )}
                    >
                      {WEEKDAY_NAMES[i]} {d.getUTCDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Pinned "Open shifts" row — unassigned (userId null) shifts.
                  Rendered first so unfilled slots are impossible to miss.
                  Deliberately excluded from the ratio numerators above. */}
              {openShiftCount > 0 && (
                <tr data-testid="open-shifts-row">
                  <td className="p-2 border border-border align-top min-w-[160px] bg-surface/60">
                    <span className="text-sm font-medium text-foreground">
                      Open shifts
                    </span>
                    <p className="text-2xs text-muted mt-0.5">
                      Unassigned — not counted in ratios
                    </p>
                  </td>
                  {weekDates.map((date) => {
                    const dayShifts = openShiftsByDay[date] ?? [];
                    return (
                      <td
                        key={date}
                        className="p-1 border border-border align-top min-w-[140px] bg-surface/60"
                        data-testid={`open-shift-cell-${date}`}
                      >
                        {dayShifts.length === 0 ? (
                          <div className="min-h-[44px]" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            {dayShifts.map((s) => {
                              const chipShift: ShiftChipShift = {
                                id: s.id,
                                userId: s.userId,
                                staffName: s.staffName,
                                shiftStart: s.shiftStart,
                                shiftEnd: s.shiftEnd,
                                sessionType: s.sessionType,
                                role: s.role,
                                status: s.status,
                                date: s.date,
                                actualStart: s.actualStart,
                                actualEnd: s.actualEnd,
                              };
                              return (
                                <ShiftChip
                                  key={s.id}
                                  shift={chipShift}
                                  onClick={
                                    canEdit
                                      ? () => setModalState({ mode: "edit", shift: s })
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}
              {staff.map((member) => {
                const certStatus = certStatusByUser[member.id];
                return (
                <tr key={member.id}>
                  <td className="p-2 border border-border align-top min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <StaffAvatar
                        user={{ id: member.id, name: member.name, avatar: member.avatar }}
                        size="xs"
                      />
                      <span className="text-sm font-medium text-foreground truncate">
                        {member.name}
                      </span>
                      {certStatus && certStatus.status !== "ok" && (
                        <CertExpiryBadge status={certStatus} />
                      )}
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const daysShifts = shiftsByUserAndDay[member.id]?.[date] ?? [];
                    const emptyCellClickable = canEdit && daysShifts.length === 0;
                    const leave = leaveByUserAndDay[member.id]?.[date];
                    // Subtle hint only, and leave chips take visual
                    // precedence — a leave-covered day already explains
                    // why the person can't work.
                    const unavailable =
                      !leave &&
                      unavailableByUser[member.id]?.has(
                        parseIsoDateLocal(date).getDay(),
                      );
                    return (
                      <td
                        key={date}
                        className={cn(
                          "p-1 border border-border align-top min-w-[140px]",
                          emptyCellClickable && "cursor-pointer hover:bg-surface/60",
                        )}
                        onClick={
                          emptyCellClickable
                            ? () => setModalState({ mode: "create", date })
                            : undefined
                        }
                        data-testid={`shift-cell-${member.id}-${date}`}
                      >
                        {leave && <OnLeaveChip isHalfDay={leave.isHalfDay} />}
                        {unavailable && <UnavailableHint />}
                        {daysShifts.length === 0 ? (
                          <div className="min-h-[44px] flex items-center justify-center text-xs text-muted/70">
                            {canEdit ? "+ Add" : "—"}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {daysShifts.map((s) => {
                              const chipShift: ShiftChipShift = {
                                id: s.id,
                                userId: s.userId,
                                staffName: s.staffName,
                                shiftStart: s.shiftStart,
                                shiftEnd: s.shiftEnd,
                                sessionType: s.sessionType,
                                role: s.role,
                                status: s.status,
                                // Variance badge fields (timeclock v1, sub-PR 5).
                                date: s.date,
                                actualStart: s.actualStart,
                                actualEnd: s.actualEnd,
                              };
                              return (
                                <ShiftChip
                                  key={s.id}
                                  shift={chipShift}
                                  onClick={
                                    canEdit
                                      ? () => setModalState({ mode: "edit", shift: s })
                                      : undefined
                                  }
                                  currentUserId={session?.user?.id}
                                  onRequestSwap={() =>
                                    setSwapDialogShift({
                                      id: s.id,
                                      serviceId,
                                      date: dateIso(s.date),
                                      shiftStart: s.shiftStart,
                                      shiftEnd: s.shiftEnd,
                                    })
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
            {/* Ratio row per day × sessionType */}
            <tfoot>
              {SESSION_TYPES.map((st) => (
                <tr key={st}>
                  <td className="p-2 border border-border bg-surface text-xs font-semibold text-muted">
                    {SESSION_LABELS[st]} ratio
                  </td>
                  {weekDates.map((dateStr) => {
                    const staffCount = ratioCountsByDay[dateStr]?.[st] ?? 0;
                    // 2026-05-02: real children count wired in via useRoster.
                    // Replaces the hardcoded `childrenCount={0}` that made every
                    // ratio cell green regardless of booking load.
                    const childrenCount = childrenCountsByDay[dateStr]?.[st] ?? 0;
                    return (
                      <td key={dateStr} className="p-1 border border-border">
                        <RatioBadge staffCount={staffCount} childrenCount={childrenCount} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
          {/* Leave-overlay honesty note (Task 5.4): staff apply for leave in
              Employment Hero — those requests never reach the internal
              LeaveRequest table this overlay reads. */}
          <p className="mt-1.5 text-2xs text-muted">
            Internal leave only — leave applied in Employment Hero won&apos;t
            appear here.
          </p>
        </div>
      )}

      {modalState && (
        <ShiftEditModal
          open
          onClose={() => setModalState(null)}
          mode={modalState.mode}
          serviceId={serviceId}
          shift={
            modalState.mode === "edit"
              ? {
                  id: modalState.shift.id,
                  userId: modalState.shift.userId,
                  date: dateIso(modalState.shift.date),
                  sessionType: modalState.shift.sessionType,
                  shiftStart: modalState.shift.shiftStart,
                  shiftEnd: modalState.shift.shiftEnd,
                  role: modalState.shift.role,
                  staffName: modalState.shift.staffName,
                }
              : undefined
          }
          defaultDate={modalState.mode === "create" ? modalState.date : undefined}
          onSaved={() => {
            setModalState(null);
            void refetch();
          }}
        />
      )}

      {swapDialogShift && session?.user?.id && (
        <ShiftSwapDialog
          open
          onClose={() => setSwapDialogShift(null)}
          shift={swapDialogShift}
          currentUserId={session.user.id}
          onSubmitted={() => {
            setSwapDialogShift(null);
            void refetch();
          }}
        />
      )}

      {templatesOpen && (
        <ShiftTemplatesPanel
          open
          onClose={() => setTemplatesOpen(false)}
          serviceId={serviceId}
        />
      )}
    </div>
  );
}


// ── OnLeaveChip ────────────────────────────────────────────────────
//
// Amber overlay chip rendered in a staff/day cell when that person has
// APPROVED internal leave covering the date (½-day variant when every
// covering entry is a half day). Data via useRosterOverlays — internal
// LeaveRequest rows only; EH-applied leave never appears (see the grid's
// legend line).

function OnLeaveChip({ isHalfDay }: { isHalfDay: boolean }) {
  return (
    <span
      data-testid="on-leave-chip"
      className="mb-1 inline-flex items-center px-1.5 py-0.5 rounded-full border text-2xs font-medium border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
    >
      {isHalfDay ? "On leave · ½ day" : "On leave"}
    </span>
  );
}

// ── UnavailableHint ────────────────────────────────────────────────
//
// Subtle muted, struck-through hint on a staff/day cell whose weekday the
// person has marked unavailable on /profile (staff-portal-v2 Task 10.2).
// Advisory only — the cell stays fully interactive, and leave chips take
// precedence (the hint is suppressed on leave-covered days).

function UnavailableHint() {
  return (
    <span
      data-testid="unavailable-hint"
      className="mb-1 block text-2xs text-muted/70 line-through"
    >
      Unavailable
    </span>
  );
}

// ── Ratio summary banner ────────────────────────────────────────────
//
// Renders a single rolled-up alert above the grid when any cell breaches
// the NQS 1:13 staff:children ratio (red) or sits within 85-100% of it
// (amber). Replaces the "scan-the-15-cells" UX with a clear "fix these
// shifts before publishing" callout.

interface RatioCell {
  dateKey: string;
  sessionType: string;
  staff: number;
  children: number;
}

const SESSION_LABEL: Record<string, string> = { bsc: "BSC", asc: "ASC", vc: "VC" };

function formatCell(c: RatioCell): string {
  const d = new Date(c.dateKey);
  const day = d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });
  return `${day} ${SESSION_LABEL[c.sessionType] ?? c.sessionType.toUpperCase()} (${c.staff} staff / ${c.children} children)`;
}

function RatioSummaryBanner({
  breaches,
  warnings,
}: {
  breaches: RatioCell[];
  warnings: RatioCell[];
}) {
  if (breaches.length === 0 && warnings.length === 0) return null;
  const hasBreach = breaches.length > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        hasBreach
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200"
          : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200",
      )}
    >
      <div className="font-medium">
        {hasBreach
          ? `${breaches.length} session${breaches.length === 1 ? "" : "s"} over the NQF 1:13 staff:children ratio`
          : `${warnings.length} session${warnings.length === 1 ? "" : "s"} near the NQF ratio limit`}
      </div>
      <ul className="mt-1 text-xs leading-5 space-y-0.5">
        {breaches.map((c) => (
          <li key={`b-${c.dateKey}-${c.sessionType}`}>
            <strong>Breach:</strong> {formatCell(c)}
          </li>
        ))}
        {warnings.slice(0, hasBreach ? 3 : warnings.length).map((c) => (
          <li key={`w-${c.dateKey}-${c.sessionType}`}>
            <span className="opacity-80">Near limit:</span> {formatCell(c)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── CertExpiryBadge ────────────────────────────────────────────────
//
// Renders a small shield next to a staff member's name in the roster
// grid when one of their compliance certificates (WWCC, first aid,
// food safety, etc.) is expired or expiring within 30 days of the
// visible week's end. Tooltip lists each cert + the date so the
// rostering admin can fix it before publishing.
//
// 2026-05-02: introduced alongside `useStaffCertStatus` as the second
// deliverable of the Connecteam-style roster spec.

const CERT_TYPE_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection",
  geccko: "GECCKO",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  other: "Other",
};

function formatCertLabel(type: string): string {
  return CERT_TYPE_LABELS[type] ?? type;
}

function formatCertDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CertExpiryBadge({ status }: { status: UserCertStatus }) {
  const variant: CertStatus = status.status;
  const Icon = variant === "expired" ? ShieldAlert : ShieldCheck;
  const palette =
    variant === "expired"
      ? "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800"
      : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-400";
  const verdictText = variant === "expired" ? "Cert expired" : "Cert expiring";
  // Build a compact tooltip: list each non-OK cert with its formatted
  // date. Skip certs that are well in the future (the tooltip only
  // surfaces ones that will or did matter for this visible week).
  const tooltip = status.certs
    .map((c) => `${formatCertLabel(c.type)}: expires ${formatCertDate(c.expiryDate)}`)
    .join("\n");
  return (
    <span
      title={tooltip || verdictText}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-2xs font-medium",
        palette,
      )}
    >
      <Icon className="w-3 h-3" />
      {verdictText}
    </span>
  );
}

// ── RosterCostChip ─────────────────────────────────────────────────
//
// Inline projection of "this week will cost ≈ $X" rendered next to the
// week navigator. Surfaces unpriced hours (shifts where the user has
// no active employment contract) as a subtle warning so the rostering
// admin can chase the missing contract before publishing.
//
// 2026-05-02: introduced alongside `/api/roster/cost-projection` as
// the fifth Connecteam-style roster deliverable.

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function RosterCostChip({
  totalHours,
  totalCost,
  unpricedHours,
}: {
  totalHours: number;
  totalCost: number;
  unpricedHours: number;
}) {
  // Compose the tooltip lazily — we don't want a multi-line title attr
  // when there's nothing unpriced.
  const tooltipParts: string[] = [
    `${totalHours.toFixed(1)}h scheduled this week`,
    `Wage cost ≈ ${AUD.format(totalCost)}`,
  ];
  if (unpricedHours > 0) {
    tooltipParts.push(
      `${unpricedHours.toFixed(1)}h unpriced — staff member has no active employment contract`,
    );
  }
  return (
    <span
      title={tooltipParts.join("\n")}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium",
        unpricedHours > 0
          ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
          : "border-border bg-surface text-foreground/80",
      )}
    >
      <span>≈ {AUD.format(totalCost)}</span>
      <span className="opacity-70">· {totalHours.toFixed(1)}h</span>
      {unpricedHours > 0 && (
        <span className="opacity-80">
          · {unpricedHours.toFixed(1)}h unpriced
        </span>
      )}
    </span>
  );
}
