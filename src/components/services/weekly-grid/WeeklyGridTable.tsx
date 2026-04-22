"use client";

import {
  WeeklyRollCallCell,
  type CellShift,
} from "../WeeklyRollCallCell";
import type { WeeklyRollCallResponse } from "@/hooks/useWeeklyRollCall";
import { cn } from "@/lib/utils";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

interface WeeklyGridTableProps {
  data: WeeklyRollCallResponse;
  weekDates: string[];
  shiftsMap: Record<string, Record<string, CellShift[]>>;
  canEdit: boolean;
  /**
   * Callbacks MUST be reference-stable across renders (parent uses useCallback).
   * They're passed directly to each memoized WeeklyRollCallCell; wrapping them
   * here would break memoization and cause all ~300 cells to re-render each tick.
   */
  onClickShift: (childId: string, date: string, shift: CellShift) => void;
  onClickEmpty: (childId: string, date: string) => void;
}

export function WeeklyGridTable({
  data,
  weekDates,
  shiftsMap,
  canEdit,
  onClickShift,
  onClickEmpty,
}: WeeklyGridTableProps) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border border-border bg-surface text-xs font-semibold uppercase tracking-wide text-muted min-w-[180px]">
              Child
            </th>
            {weekDates.map((dateStr, i) => {
              const isToday = dateStr === today;
              const d = new Date(dateStr);
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
          {data.children.map((child) => (
            <tr key={child.id}>
              <td className="p-2 border border-border align-top min-w-[180px]">
                <div className="flex items-center gap-2">
                  {child.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={child.photo}
                      alt={`${child.firstName} ${child.surname}`}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
                      {`${child.firstName[0] ?? ""}${child.surname[0] ?? ""}`.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground truncate">
                    {child.firstName} {child.surname}
                  </span>
                </div>
              </td>
              {weekDates.map((date) => {
                const shifts = shiftsMap[child.id]?.[date] ?? [];
                return (
                  <td
                    key={date}
                    className="p-1 border border-border align-top min-w-[120px]"
                  >
                    {shifts.length === 0 ? (
                      <WeeklyRollCallCell
                        shift={null}
                        childId={child.id}
                        date={date}
                        canEdit={canEdit}
                        onClickEmpty={onClickEmpty}
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {shifts.map((shift) => (
                          <WeeklyRollCallCell
                            key={
                              shift.attendanceId ??
                              shift.bookingId ??
                              `${child.id}-${date}-${shift.sessionType}`
                            }
                            shift={shift}
                            childId={child.id}
                            date={date}
                            canEdit={canEdit}
                            onClickShift={onClickShift}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
