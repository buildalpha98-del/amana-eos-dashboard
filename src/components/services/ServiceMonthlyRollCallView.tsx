"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useMonthlyRollCall,
  type MonthlyRollCallDay,
} from "@/hooks/useMonthlyRollCall";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────

interface ServiceMonthlyRollCallViewProps {
  serviceId: string;
}

type Tone = "neutral" | "green" | "amber" | "red";

// ── Date helpers (UTC-safe) ──────────────────────────────

/** Return "YYYY-MM" for the current UTC month shifted by `monthOffset`. */
function monthStrFromOffset(monthOffset: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Produce the 42-cell calendar layout (6 rows × 7 cols, Monday-start). */
function buildCalendarCells(
  month: string,
): Array<{ dateKey: string | null; dayNum: number | null; inMonth: boolean }> {
  const [y, m] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const lastOfMonth = new Date(Date.UTC(y, m, 0)); // last day of month

  // Monday-start: 0=Sun..6=Sat → we want Mon=0, Sun=6
  const jsDow = firstOfMonth.getUTCDay(); // 0..6
  const leading = jsDow === 0 ? 6 : jsDow - 1; // days of padding before day 1

  const cells: Array<{
    dateKey: string | null;
    dayNum: number | null;
    inMonth: boolean;
  }> = [];

  // Leading padding (previous month's tail)
  for (let i = 0; i < leading; i++) {
    cells.push({ dateKey: null, dayNum: null, inMonth: false });
  }

  // Month days
  for (let d = 1; d <= lastOfMonth.getUTCDate(); d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateKey: key, dayNum: d, inMonth: true });
  }

  // Trailing padding to reach 42 cells
  while (cells.length < 42) {
    cells.push({ dateKey: null, dayNum: null, inMonth: false });
  }

  return cells.slice(0, 42);
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Tone classification ──────────────────────────────────

function classifyTone(day: MonthlyRollCallDay | undefined): Tone {
  if (!day || day.booked === 0) return "neutral";
  const rate = day.attended / day.booked;
  if (rate >= 0.9) return "green";
  if (rate >= 0.7) return "amber";
  return "red";
}

const toneCellClass: Record<Tone, string> = {
  neutral: "bg-card border-border hover:bg-surface",
  green: "bg-green-100 border-green-400 hover:bg-green-200",
  amber: "bg-yellow-100 border-yellow-400 hover:bg-yellow-200",
  red: "bg-red-100 border-red-400 hover:bg-red-200",
};

const tonePillClass: Record<Tone, string> = {
  neutral: "bg-surface text-muted",
  green: "bg-green-600 text-white",
  amber: "bg-yellow-600 text-white",
  red: "bg-red-600 text-white",
};

// ── Component ────────────────────────────────────────────

export function ServiceMonthlyRollCallView({
  serviceId,
}: ServiceMonthlyRollCallViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [monthOffset, setMonthOffset] = useState(0);
  const month = useMemo(() => monthStrFromOffset(monthOffset), [monthOffset]);

  const { data, isLoading, error } = useMonthlyRollCall(serviceId, month);

  const dayMap = useMemo(() => {
    const m = new Map<string, MonthlyRollCallDay>();
    for (const d of data?.days ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const cells = useMemo(() => buildCalendarCells(month), [month]);

  function handleDayClick(dateKey: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("rollCallView", "daily");
    params.set("date", dateKey);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="secondary"
          iconLeft={<ChevronLeft className="w-4 h-4" />}
          onClick={() => setMonthOffset((p) => p - 1)}
          aria-label="Previous month"
        />
        <span
          className="text-sm font-medium text-foreground min-w-[160px] text-center"
          data-testid="monthly-range-label"
        >
          {formatMonthLabel(month)}
        </span>
        <Button
          size="xs"
          variant="secondary"
          iconLeft={<ChevronRight className="w-4 h-4" />}
          onClick={() => setMonthOffset((p) => p + 1)}
          aria-label="Next month"
        />
        {monthOffset !== 0 && (
          <Button size="xs" variant="ghost" onClick={() => setMonthOffset(0)}>
            Today
          </Button>
        )}
      </div>

      {/* Grid */}
      {error ? (
        <ErrorState error={error} />
      ) : isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {/* Weekday headers — Monday first */}
          <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(
              (d) => (
                <div
                  key={d}
                  data-testid={`monthly-header-${d}`}
                  className="text-center px-1 py-1"
                >
                  {d}
                </div>
              ),
            )}
          </div>

          {/* 42 cells */}
          <div
            data-testid="monthly-grid"
            className="grid grid-cols-7 gap-1"
          >
            {cells.map((cell, idx) => {
              if (!cell.inMonth || !cell.dateKey) {
                return (
                  <div
                    key={`pad-${idx}`}
                    data-testid={`monthly-pad-${idx}`}
                    className="aspect-square sm:aspect-[4/3] min-h-[56px] rounded-md bg-transparent"
                  />
                );
              }
              const day = dayMap.get(cell.dateKey);
              const tone = classifyTone(day);
              const hasActivity = (day?.booked ?? 0) > 0;
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  data-testid={`monthly-cell-${cell.dateKey}`}
                  data-tone={tone}
                  onClick={() => handleDayClick(cell.dateKey!)}
                  className={cn(
                    "aspect-square sm:aspect-[4/3] min-h-[56px] rounded-md border text-left p-1.5 flex flex-col transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50",
                    toneCellClass[tone],
                  )}
                  aria-label={`${cell.dateKey} — ${day?.attended ?? 0} attended of ${day?.booked ?? 0} booked`}
                >
                  <span className="text-xs font-semibold text-foreground">
                    {cell.dayNum}
                  </span>
                  {hasActivity && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                      <span
                        className={cn(
                          "text-[11px] font-bold rounded-full px-2 py-0.5",
                          tonePillClass[tone],
                        )}
                      >
                        {day!.attended}/{day!.booked}
                      </span>
                      {day!.absent > 0 && (
                        <span className="text-[10px] text-muted">
                          {day!.absent} absent
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
