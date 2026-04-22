"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────

export type CellStatus = "booked" | "signed_in" | "signed_out" | "absent";

export interface CellShift {
  attendanceId?: string;
  bookingId?: string;
  sessionType: "bsc" | "asc" | "vc";
  status: CellStatus;
  signInTime?: string | null;
  signOutTime?: string | null;
  fee?: number | null;
}

export interface WeeklyRollCallCellProps {
  shift: CellShift | null;
  childId: string;
  date: string;
  onClickShift?: (childId: string, date: string, shift: CellShift) => void;
  onClickEmpty?: (childId: string, date: string) => void;
  canEdit: boolean;
}

// ── Helpers ──────────────────────────────────────────────

function formatHourMinute(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<CellStatus, string> = {
  booked: "bg-teal-50 border-teal-300 text-teal-900",
  signed_in: "bg-green-100 border-green-400 text-green-900",
  signed_out: "bg-blue-100 border-blue-400 text-blue-900",
  absent: "bg-red-100 border-red-400 text-red-900",
};

// ── Component ────────────────────────────────────────────

function WeeklyRollCallCellImpl({
  shift,
  childId,
  date,
  onClickShift,
  onClickEmpty,
  canEdit,
}: WeeklyRollCallCellProps) {
  if (!shift) {
    const clickable = canEdit && !!onClickEmpty;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => (clickable ? onClickEmpty(childId, date) : undefined)}
        data-testid={`weekly-cell-empty-${childId}-${date}`}
        className={cn(
          "w-full h-14 border border-dashed border-border rounded-md text-[11px] text-muted",
          clickable ? "hover:bg-surface cursor-pointer" : "cursor-default",
        )}
        aria-label={canEdit ? `Add booking on ${date}` : "No booking"}
      >
        {canEdit ? "+ Add" : ""}
      </button>
    );
  }

  const clickable = canEdit && !!onClickShift;
  const color = STATUS_COLORS[shift.status];

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => (clickable ? onClickShift(childId, date, shift) : undefined)}
      data-testid={`weekly-cell-shift-${childId}-${date}-${shift.sessionType}`}
      aria-label={`${shift.sessionType.toUpperCase()} ${shift.status} on ${date}`}
      className={cn(
        "w-full h-14 border rounded-md p-1 text-xs text-left flex flex-col justify-center overflow-hidden",
        color,
        clickable ? "cursor-pointer hover:brightness-95" : "cursor-default",
      )}
    >
      <div className="font-semibold uppercase leading-tight">
        {shift.sessionType}
      </div>
      {shift.signInTime && (
        <div className="text-[10px] leading-tight truncate">
          In: {formatHourMinute(shift.signInTime)}
        </div>
      )}
      {shift.signOutTime && (
        <div className="text-[10px] leading-tight truncate">
          Out: {formatHourMinute(shift.signOutTime)}
        </div>
      )}
    </button>
  );
}

/**
 * Memoized cell — prevents full grid re-render on single-shift updates.
 * Comparator checks only the fields that affect rendering.
 */
export const WeeklyRollCallCell = memo(
  WeeklyRollCallCellImpl,
  (prev, next) =>
    prev.shift?.attendanceId === next.shift?.attendanceId &&
    prev.shift?.bookingId === next.shift?.bookingId &&
    prev.shift?.status === next.shift?.status &&
    prev.shift?.sessionType === next.shift?.sessionType &&
    prev.shift?.signInTime === next.shift?.signInTime &&
    prev.shift?.signOutTime === next.shift?.signOutTime &&
    prev.childId === next.childId &&
    prev.date === next.date &&
    prev.canEdit === next.canEdit &&
    // Callback identity stability is the parent's responsibility (useCallback);
    // still compare references so a swap re-renders.
    prev.onClickShift === next.onClickShift &&
    prev.onClickEmpty === next.onClickEmpty,
);
