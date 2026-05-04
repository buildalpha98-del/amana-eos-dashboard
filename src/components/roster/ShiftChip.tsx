"use client";

import { cn } from "@/lib/utils";
import { computeVariance, varianceLabel, type VarianceStatus } from "@/lib/timeclock-variance";

export interface ShiftChipShift {
  id: string;
  userId?: string | null;
  staffName: string;
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  sessionType: string; // "bsc" | "asc" | "vc" | other
  role?: string | null;
  status: "draft" | "published" | "unscheduled";
  // 2026-05-04 (timeclock v1, sub-PR 5): optional. When provided, the
  // chip renders a small variance pill next to the time. Older
  // surfaces (cron-pulled, OWNA roster syncs etc.) that don't carry
  // these fields just don't show the badge.
  date?: string | Date;
  actualStart?: string | Date | null;
  actualEnd?: string | Date | null;
}

export interface ShiftChipProps {
  shift: ShiftChipShift;
  onClick?: (shift: ShiftChipShift) => void;
  /** Chunk 9 wires this — shows a '⋯' menu that calls it. */
  onRequestSwap?: (shift: ShiftChipShift) => void;
  /** Chunk 9 wires this — when it matches shift.userId the '⋯' menu appears. */
  currentUserId?: string;
  className?: string;
}

// ─── Session-type palette ─────────────────────────────────────
// Keep colour tokens explicit so tests (and humans) can assert on them.
const SESSION_STYLES: Record<string, string> = {
  bsc: "bg-blue-100 text-blue-900 border-blue-400",
  asc: "bg-green-100 text-green-900 border-green-400",
  vc: "bg-purple-100 text-purple-900 border-purple-400",
};
const SESSION_DEFAULT = "bg-gray-100 text-gray-900 border-gray-400";

function styleFor(sessionType: string): string {
  return SESSION_STYLES[sessionType] ?? SESSION_DEFAULT;
}

export function ShiftChip({
  shift,
  onClick,
  onRequestSwap,
  currentUserId,
  className,
}: ShiftChipProps) {
  const isOwner =
    currentUserId !== undefined &&
    shift.userId != null &&
    shift.userId === currentUserId;
  const showSwap = isOwner && typeof onRequestSwap === "function";

  const clickable = typeof onClick === "function";

  return (
    <div
      onClick={clickable ? () => onClick!(shift) : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        styleFor(shift.sessionType),
        shift.status === "draft" ? "border-dashed" : "border-solid",
        clickable && "cursor-pointer hover:opacity-80",
        className,
      )}
    >
      <span className="font-semibold truncate max-w-[8rem]">{shift.staffName}</span>
      <span className="opacity-70">
        {shift.shiftStart}–{shift.shiftEnd}
      </span>
      {shift.role ? <span className="opacity-70 truncate max-w-[6rem]">· {shift.role}</span> : null}
      {shift.date && shift.actualStart !== undefined ? (
        <VarianceBadge
          date={shift.date}
          shiftStart={shift.shiftStart}
          shiftEnd={shift.shiftEnd}
          actualStart={shift.actualStart ?? null}
          actualEnd={shift.actualEnd ?? null}
        />
      ) : null}
      {showSwap ? (
        <button
          type="button"
          aria-label="Request swap"
          onClick={(e) => {
            e.stopPropagation();
            onRequestSwap!(shift);
          }}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10"
        >
          <span aria-hidden>⋯</span>
        </button>
      ) : null}
    </div>
  );
}

// ── VarianceBadge ────────────────────────────────────────────────
//
// Tiny pill that lives next to the shift time on the weekly grid.
// Hidden when there's no useful signal (no actual clock-in yet on a
// past shift is still "—" — coordinator can see at a glance who's
// missing). 2026-05-04: timeclock v1, sub-PR 5.

const VARIANCE_STYLES: Record<VarianceStatus, string> = {
  none: "bg-gray-100 text-gray-500 border-gray-300",
  active: "bg-blue-100 text-blue-800 border-blue-300",
  "on-time": "bg-green-100 text-green-800 border-green-400",
  early: "bg-blue-100 text-blue-800 border-blue-300",
  late: "bg-amber-100 text-amber-800 border-amber-400",
  "very-late": "bg-red-100 text-red-800 border-red-400",
};

interface VarianceBadgeProps {
  date: string | Date;
  shiftStart: string;
  shiftEnd: string;
  actualStart: string | Date | null;
  actualEnd: string | Date | null;
}

function VarianceBadge(props: VarianceBadgeProps) {
  const v = computeVariance(props);
  const label = varianceLabel(v);
  // Tooltip explains the numbers — coordinators glancing at the grid
  // appreciate "scheduled 15:00, clocked 15:12" rather than just "+12m".
  const tooltip =
    v.status === "none"
      ? "Not yet clocked in"
      : v.status === "active"
        ? `Clocked in ${v.startDeltaMin === 0 ? "on time" : v.startDeltaMin && v.startDeltaMin > 0 ? `${v.startDeltaMin}m late` : `${Math.abs(v.startDeltaMin ?? 0)}m early`}; still on shift`
        : `Scheduled ${props.shiftStart}–${props.shiftEnd} · clock-in ${v.startDeltaMin === 0 ? "exactly on time" : v.startDeltaMin && v.startDeltaMin > 0 ? `${v.startDeltaMin}m late` : `${Math.abs(v.startDeltaMin ?? 0)}m early`}${v.endDeltaMin !== null ? ` · clock-out ${v.endDeltaMin === 0 ? "on time" : v.endDeltaMin > 0 ? `${v.endDeltaMin}m over` : `${Math.abs(v.endDeltaMin)}m under`}` : ""}`;
  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
        VARIANCE_STYLES[v.status],
      )}
    >
      {label}
    </span>
  );
}
