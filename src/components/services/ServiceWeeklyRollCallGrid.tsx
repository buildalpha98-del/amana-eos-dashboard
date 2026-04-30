"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, UserPlus, Users } from "lucide-react";
import {
  useWeeklyRollCall,
  type WeeklyRollCallAttendanceRecord,
} from "@/hooks/useWeeklyRollCall";
import type { CellShift, CellStatus } from "./WeeklyRollCallCell";
import {
  CellActionsPopover,
  type RollCallAction,
} from "./weekly-grid/CellActionsPopover";
import { AddChildDialog } from "./weekly-grid/AddChildDialog";
import { WeeklyGridTable } from "./weekly-grid/WeeklyGridTable";
import { EmptyCellPicker } from "./weekly-grid/EmptyCellPicker";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import { isAdminRole } from "@/lib/role-permissions";

// ── Types ────────────────────────────────────────────────

interface ServiceWeeklyRollCallGridProps {
  serviceId: string;
}

type SessionType = "bsc" | "asc" | "vc";

interface RollCallMutationBody {
  childId: string;
  date: string;
  sessionType: SessionType;
  action: RollCallAction;
  absenceReason?: string;
  notes?: string;
}

// ── Date helpers (UTC-safe) ──────────────────────────────

/** Monday-of-current-week + weekOffset, UTC-safe YYYY-MM-DD. */
function mondayIsoFromOffset(weekOffset: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff + weekOffset * 7);
  return d.toISOString().split("T")[0];
}

function fridayFromMonday(mondayIso: string): string {
  const [y, m, dd] = mondayIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().split("T")[0];
}

function formatWeekRange(mondayIso: string): string {
  const fri = fridayFromMonday(mondayIso);
  const mon = new Date(mondayIso);
  const friDate = new Date(fri);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  };
  return `${mon.toLocaleDateString("en-AU", opts)} – ${friDate.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

// ── Status derivation ────────────────────────────────────

function deriveStatus(rec: WeeklyRollCallAttendanceRecord): CellStatus {
  if (rec.status === "absent") return "absent";
  if (rec.signOutTime) return "signed_out";
  if (rec.signInTime) return "signed_in";
  return "booked";
}

// ── Component ────────────────────────────────────────────

export function ServiceWeeklyRollCallGrid({
  serviceId,
}: ServiceWeeklyRollCallGridProps) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const userServiceId =
    (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;

  // Admin roles edit everywhere. Coordinators and staff edit only at their OWN
  // service (per access-control matrix in spec). Members and marketing are read-only.
  const canEdit =
    isAdminRole(role) ||
    (role === "member" && userServiceId === serviceId) ||
    (role === "staff" && userServiceId === serviceId);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => mondayIsoFromOffset(weekOffset), [weekOffset]);

  const weekDates = useMemo(() => {
    const [y, m, dd] = weekStart.split("-").map(Number);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1, dd));
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().split("T")[0];
    });
  }, [weekStart]);

  const { data, isLoading, error } = useWeeklyRollCall(serviceId, weekStart);

  // Build shiftsByChildAndDay map (child ID → date → CellShift[]).
  // Merges AttendanceRecords (authoritative) with booking-only rows (status: "booked").
  const shiftsMap = useMemo(() => {
    const m: Record<string, Record<string, CellShift[]>> = {};
    if (!data) return m;

    for (const rec of data.attendanceRecords) {
      const date = rec.date.split("T")[0]; // AttendanceRecord.date (NOT attendanceDate)
      m[rec.childId] ??= {};
      m[rec.childId][date] ??= [];
      m[rec.childId][date].push({
        attendanceId: rec.id,
        sessionType: rec.sessionType,
        status: deriveStatus(rec),
        signInTime: rec.signInTime,
        signOutTime: rec.signOutTime,
      });
    }
    // Add booking-only (no attendance record yet) as "booked"
    for (const b of data.bookings) {
      const date = b.date.split("T")[0];
      if (
        m[b.childId]?.[date]?.some((s) => s.sessionType === b.sessionType)
      )
        continue;
      m[b.childId] ??= {};
      m[b.childId][date] ??= [];
      m[b.childId][date].push({
        bookingId: b.id,
        sessionType: b.sessionType,
        status: "booked",
        fee: b.fee,
      });
    }
    return m;
  }, [data]);

  // ── Mutation ─────────────────────────────────────────
  const qc = useQueryClient();
  const rollCallMutation = useMutation({
    mutationFn: (body: RollCallMutationBody) =>
      mutateApi<{ id: string }>("/api/attendance/roll-call", {
        method: "POST",
        body: { serviceId, ...body },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
      qc.invalidateQueries({ queryKey: ["monthly-roll-call", serviceId] });
      qc.invalidateQueries({ queryKey: ["enrollable-children", serviceId, weekStart] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });

  // ── Popover / dialog state ───────────────────────────
  const [activeCell, setActiveCell] = useState<
    | { childId: string; childName: string; date: string; shift: CellShift }
    | null
  >(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [emptyCellSession, setEmptyCellSession] = useState<
    | { childId: string; childName: string; date: string }
    | null
  >(null);

  // Child-name lookup (stable per data slice). Lets the stable cell callbacks
  // resolve a display name without re-binding per row.
  const childNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of data?.children ?? []) {
      m[c.id] = `${c.firstName} ${c.surname}`;
    }
    return m;
  }, [data]);

  // Stable callbacks — passed directly to memoized cells. Must keep a stable
  // identity across parent re-renders (only change when canEdit / name-map do),
  // otherwise the ~300 cells in the grid re-render on every tick.
  const handleClickShift = useCallback(
    (childId: string, date: string, shift: CellShift) => {
      if (!canEdit) return;
      setActiveCell({
        childId,
        childName: childNameById[childId] ?? "",
        date,
        shift,
      });
    },
    [canEdit, childNameById],
  );

  const handleClickEmpty = useCallback(
    (childId: string, date: string) => {
      if (!canEdit) return;
      setEmptyCellSession({
        childId,
        childName: childNameById[childId] ?? "",
        date,
      });
    },
    [canEdit, childNameById],
  );

  // ── Render ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronLeft className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p - 1)}
            aria-label="Previous week"
          />
          <span
            className="text-sm font-medium text-foreground min-w-[200px] text-center"
            data-testid="weekly-range-label"
          >
            Week of {formatWeekRange(weekStart)}
          </span>
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronRight className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p + 1)}
            aria-label="Next week"
          />
          {weekOffset !== 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setWeekOffset(0)}
            >
              Today
            </Button>
          )}
        </div>

        {canEdit && (
          <Button
            size="sm"
            variant="primary"
            iconLeft={<UserPlus className="w-4 h-4" />}
            onClick={() => setAddDialogOpen(true)}
          >
            Add child to week
          </Button>
        )}
      </div>

      {/* Grid */}
      {error ? (
        <ErrorState error={error} />
      ) : isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : data.children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No children on roster"
          description={
            canEdit
              ? "Add a child to this week using the button above."
              : "No bookings or attendance records for this week."
          }
        />
      ) : (
        <WeeklyGridTable
          data={data}
          weekDates={weekDates}
          shiftsMap={shiftsMap}
          canEdit={canEdit}
          onClickShift={handleClickShift}
          onClickEmpty={handleClickEmpty}
        />
      )}

      {/* Cell actions popover */}
      {activeCell && (
        <CellActionsPopover
          open
          shift={activeCell.shift}
          childName={activeCell.childName}
          date={activeCell.date}
          isPending={rollCallMutation.isPending}
          onClose={() => setActiveCell(null)}
          onAction={async (action, extra) => {
            await rollCallMutation.mutateAsync({
              childId: activeCell.childId,
              date: activeCell.date,
              sessionType: activeCell.shift.sessionType,
              action,
              ...(extra?.absenceReason
                ? { absenceReason: extra.absenceReason }
                : {}),
            });
          }}
        />
      )}

      {/* Empty cell quick-book — default to ASC on single click */}
      {emptyCellSession && (
        <EmptyCellPicker
          open
          childName={emptyCellSession.childName}
          date={emptyCellSession.date}
          onClose={() => setEmptyCellSession(null)}
          onPick={async (sessionType) => {
            try {
              await rollCallMutation.mutateAsync({
                childId: emptyCellSession.childId,
                date: emptyCellSession.date,
                sessionType,
                action: "undo", // creates status: "booked" via upsert
              });
              toast({ description: "Booking added." });
            } catch {
              // onError toast handled by mutation hook
            } finally {
              setEmptyCellSession(null);
            }
          }}
        />
      )}

      {/* Add child to week dialog */}
      {addDialogOpen && (
        <AddChildDialog
          open
          onClose={() => setAddDialogOpen(false)}
          serviceId={serviceId}
          weekStart={weekStart}
          weekDates={weekDates}
        />
      )}
    </div>
  );
}

