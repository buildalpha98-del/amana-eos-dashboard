"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { ShiftChip, type ShiftChipShift } from "@/components/roster/ShiftChip";

interface WeekShift extends ShiftChipShift {
  date: string; // ISO
}

interface MyWeekShiftsProps {
  userId: string;
  /** Monday of the week to display (YYYY-MM-DD). */
  weekStart: string;
}

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatDay(date: string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
  });
}

export function MyWeekShifts({ userId, weekStart }: MyWeekShiftsProps) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const endStr = end.toISOString().split("T")[0];

  const { data, isLoading, error } = useQuery<{ shifts: WeekShift[] }>({
    queryKey: ["my-week-shifts", userId, weekStart],
    queryFn: () =>
      fetchApi<{ shifts: WeekShift[] }>(
        `/api/roster/shifts/mine?from=${weekStart}&to=${endStr}`,
      ),
    retry: 2,
    staleTime: 30_000,
    enabled: !!userId,
  });

  const days = weekDates(weekStart);

  return (
    <div data-testid="my-week-shifts">
      {error ? (
        <p className="text-sm text-red-600 mb-3">
          Unable to load shifts. Please refresh the page.
        </p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map((date) => {
          const dayShifts = (data?.shifts ?? []).filter(
            (s) => new Date(s.date).toISOString().split("T")[0] === date,
          );
          return (
            <div
              key={date}
              className="border border-border rounded-lg bg-card p-2 min-h-[96px]"
              data-testid={`week-day-${date}`}
            >
              <div className="text-xs text-muted mb-2">{formatDay(date)}</div>
              <div className="flex flex-col gap-1.5">
                {isLoading ? (
                  <span className="text-xs text-muted">Loading…</span>
                ) : dayShifts.length === 0 ? (
                  <span className="text-xs text-muted/70">Off</span>
                ) : (
                  dayShifts.map((s) => <ShiftChip key={s.id} shift={s} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
