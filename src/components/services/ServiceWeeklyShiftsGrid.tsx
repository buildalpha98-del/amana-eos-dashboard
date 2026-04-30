"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRosterShifts, type RosterShiftListItem } from "@/hooks/useRosterShifts";
import { useTeam } from "@/hooks/useTeam";
import { ShiftChip, type ShiftChipShift } from "@/components/roster/ShiftChip";
import { RatioBadge } from "@/components/roster/RatioBadge";
import { ShiftEditModal } from "@/components/roster/ShiftEditModal";
import { ShiftSwapDialog } from "@/components/roster/ShiftSwapDialog";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { isAdminRole } from "@/lib/role-permissions";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface ServiceWeeklyShiftsGridProps {
  serviceId: string;
  serviceName?: string;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SESSION_TYPES = ["bsc", "asc", "vc"] as const;
const SESSION_LABELS: Record<(typeof SESSION_TYPES)[number], string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function getMondayIso(offsetWeeks: number): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function formatWeekRange(mondayIso: string): string {
  const monday = new Date(mondayIso);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("en-AU", opts)} – ${friday.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

function dateIso(date: string | Date): string {
  return (typeof date === "string" ? new Date(date) : date).toISOString().split("T")[0];
}

type ModalState =
  | { mode: "create"; date: string }
  | { mode: "edit"; shift: RosterShiftListItem }
  | null;

export function ServiceWeeklyShiftsGrid({ serviceId }: ServiceWeeklyShiftsGridProps) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  const canEdit =
    isAdminRole(role) || (role === "coordinator" && sessionServiceId === serviceId);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => getMondayIso(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  }, [weekStart]);

  const {
    data: shiftsData,
    isLoading: shiftsLoading,
    error: shiftsError,
    refetch,
  } = useRosterShifts(serviceId, weekStart);

  const { data: teamData, isLoading: teamLoading } = useTeam({ service: serviceId });

  const staff = useMemo(() => {
    if (!teamData) return [];
    return teamData.filter((m) => {
      const atService = m.service?.id === serviceId;
      const isActive = (m as { active?: boolean }).active !== false;
      return atService && isActive;
    });
  }, [teamData, serviceId]);

  // Build grid: userId → dateIso → shifts[]
  const shiftsByUserAndDay = useMemo(() => {
    const out: Record<string, Record<string, RosterShiftListItem[]>> = {};
    for (const shift of shiftsData?.shifts ?? []) {
      if (!shift.userId) continue;
      const key = dateIso(shift.date);
      if (!out[shift.userId]) out[shift.userId] = {};
      if (!out[shift.userId][key]) out[shift.userId][key] = [];
      out[shift.userId][key].push(shift);
    }
    return out;
  }, [shiftsData]);

  // Per-day × session-type rostered staff count (for ratio badges)
  const ratioCountsByDay = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const dateKey of weekDates) {
      out[dateKey] = { bsc: 0, asc: 0, vc: 0 };
    }
    for (const shift of shiftsData?.shifts ?? []) {
      const key = dateIso(shift.date);
      if (!out[key]) continue;
      const st = shift.sessionType;
      if (st in out[key]) {
        out[key][st] = (out[key][st] ?? 0) + 1;
      }
    }
    return out;
  }, [shiftsData, weekDates]);

  const [modalState, setModalState] = useState<ModalState>(null);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
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
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    const sourceWeekStart = prev.toISOString().split("T")[0];
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

  const isLoading = shiftsLoading || teamLoading;

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

        {canEdit && (
          <div className="flex items-center gap-2">
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
          No active staff assigned to this service.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border border-border bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
                  Staff
                </th>
                {weekDates.map((dateStr, i) => {
                  const d = new Date(dateStr);
                  const isToday = dateStr === new Date().toISOString().split("T")[0];
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
              {staff.map((member) => (
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
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const daysShifts = shiftsByUserAndDay[member.id]?.[date] ?? [];
                    const emptyCellClickable = canEdit && daysShifts.length === 0;
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
                        {daysShifts.length === 0 ? (
                          <div className="min-h-[44px] flex items-center justify-center text-[11px] text-muted/70">
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
              ))}
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
                    // Children count wired to 0 — follow-up hooks useRoster booking data.
                    return (
                      <td key={dateStr} className="p-1 border border-border">
                        <RatioBadge staffCount={staffCount} childrenCount={0} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
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
    </div>
  );
}
