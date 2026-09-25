"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getWeekStart, toLocalIsoDate } from "@/lib/utils";

/**
 * Parse a `YYYY-MM-DD` string as LOCAL midnight.
 *
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, so the moment local
 * getters (`getDate`/`setDate`) or `toLocalIsoDate` touch it the calendar
 * day can shift in non-UTC timezones. Every week-start string in the roster
 * surfaces goes through this instead.
 */
export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the current week as a local `YYYY-MM-DD` string. */
export function currentWeekStartIso(): string {
  return toLocalIsoDate(getWeekStart());
}

/** Add `days` to a local `YYYY-MM-DD` string, returning the same format. */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateLocal(iso);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

function formatWeekRange(mondayIso: string): string {
  const monday = parseIsoDateLocal(mondayIso);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("en-AU", opts)} – ${friday.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

export interface WeekPickerProps {
  /** Monday of the visible week, `YYYY-MM-DD`. */
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
}

/**
 * Controlled Mon–Fri week navigator, extracted from `ServiceWeeklyShiftsGrid`
 * (staff-portal-v2 Chunk 5) so the `/roster` command centre can drive several
 * grids from a single picker. Purely controlled — owns no week state.
 */
export function WeekPicker({ weekStart, onWeekChange }: WeekPickerProps) {
  const thisWeek = currentWeekStartIso();
  return (
    <div className="flex items-center gap-2">
      <Button
        size="xs"
        variant="secondary"
        iconLeft={<ChevronLeft className="w-4 h-4" />}
        onClick={() => onWeekChange(addDaysIso(weekStart, -7))}
        aria-label="Previous week"
      />
      <span className="text-sm font-medium text-foreground min-w-[200px] text-center">
        {formatWeekRange(weekStart)}
      </span>
      <Button
        size="xs"
        variant="secondary"
        iconLeft={<ChevronRight className="w-4 h-4" />}
        onClick={() => onWeekChange(addDaysIso(weekStart, 7))}
        aria-label="Next week"
      />
      {weekStart !== thisWeek && (
        <Button size="xs" variant="ghost" onClick={() => onWeekChange(thisWeek)}>
          Today
        </Button>
      )}
    </div>
  );
}
