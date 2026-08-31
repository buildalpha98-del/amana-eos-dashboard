"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { SessionType } from "@prisma/client";

// ── Types ────────────────────────────────────────────────

export type CellStatus = "booked" | "signed_in" | "signed_out" | "absent";

export interface CellShift {
  attendanceId?: string;
  bookingId?: string;
  sessionType: SessionType;
  /**
   * The room's own name, attached when the grid builds the shift.
   * Absent only for a slot with no room record — the chip falls back
   * to the code rather than rendering blank.
   */
  roomName?: string;
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
  booked: "bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-900 dark:text-teal-200",
  signed_in: "bg-green-100 dark:bg-green-950/50 border-green-400 text-green-900 dark:text-green-200",
  signed_out: "bg-blue-100 dark:bg-blue-950/50 border-blue-400 text-blue-900 dark:text-blue-200",
  absent: "bg-red-100 dark:bg-red-950/50 border-red-400 text-red-900 dark:text-red-200",
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
          "w-full h-14 border border-dashed border-border rounded-md text-xs text-muted",
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
      title={shift.roomName ?? shift.sessionType.toUpperCase()}
      aria-label={`${shift.roomName ?? shift.sessionType.toUpperCase()} ${shift.status} on ${date}`}
      className={cn(
        "w-full h-14 border rounded-md p-1 text-xs text-left flex flex-col justify-center overflow-hidden",
        color,
        clickable ? "cursor-pointer hover:brightness-95" : "cursor-default",
      )}
    >
      {/* The room's name, clipped to the cell. A weekly grid cell is
          too small for "Amana Afternoons" in full, and inventing an
          abbreviation risks two rooms colliding — so it truncates, and
          the title above carries the whole name. */}
      <div className="font-semibold leading-tight truncate w-full">
        {shift.roomName ?? shift.sessionType.toUpperCase()}
      </div>
      {shift.signInTime && (
        <div className="text-2xs leading-tight truncate">
          In: {formatHourMinute(shift.signInTime)}
        </div>
      )}
      {shift.signOutTime && (
        <div className="text-2xs leading-tight truncate">
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
