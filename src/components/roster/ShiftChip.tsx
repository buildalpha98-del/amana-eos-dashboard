"use client";

import { cn } from "@/lib/utils";

export interface ShiftChipShift {
  id: string;
  userId?: string | null;
  staffName: string;
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  sessionType: string; // "bsc" | "asc" | "vc" | other
  role?: string | null;
  status: "draft" | "published";
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
