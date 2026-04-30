"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { ShiftChip, type ShiftChipShift } from "@/components/roster/ShiftChip";
import { ShiftSwapDialog } from "@/components/roster/ShiftSwapDialog";

interface MineShift extends ShiftChipShift {
  date: string; // ISO string from the API
  service?: { id: string; name: string } | null;
}

interface MyUpcomingShiftsCardProps {
  userId: string;
}

function nextSevenDays(): { from: string; to: string } {
  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const to = end.toISOString().split("T")[0];
  return { from, to };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isoDate(value: string): string {
  return new Date(value).toISOString().split("T")[0];
}

export function MyUpcomingShiftsCard({ userId }: MyUpcomingShiftsCardProps) {
  const { from, to } = nextSevenDays();

  const { data, isLoading, error, refetch } = useQuery<{ shifts: MineShift[] }>({
    queryKey: ["my-shifts", userId, from, to],
    queryFn: () =>
      fetchApi<{ shifts: MineShift[] }>(
        `/api/roster/shifts/mine?from=${from}&to=${to}`,
      ),
    enabled: !!userId,
    retry: 2,
    staleTime: 60_000,
  });

  const [swapDialogShift, setSwapDialogShift] = useState<{
    id: string;
    serviceId: string;
    date: string;
    shiftStart: string;
    shiftEnd: string;
  } | null>(null);

  return (
    <div
      className="bg-card rounded-xl border border-border p-6"
      data-testid="my-upcoming-shifts-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-brand" />
          My Upcoming Shifts
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading shifts…</p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load shifts. Please refresh the page.
        </p>
      ) : !data || data.shifts.length === 0 ? (
        <p className="text-sm text-muted">No upcoming shifts rostered</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.shifts.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3"
              data-testid={`my-shift-${s.id}`}
            >
              <span className="text-xs text-muted w-28 flex-shrink-0">
                {formatDate(s.date)}
              </span>
              <ShiftChip
                shift={s}
                currentUserId={userId}
                onRequestSwap={
                  s.service?.id
                    ? () =>
                        setSwapDialogShift({
                          id: s.id,
                          serviceId: s.service!.id,
                          date: isoDate(s.date),
                          shiftStart: s.shiftStart,
                          shiftEnd: s.shiftEnd,
                        })
                    : undefined
                }
              />
              {s.service?.name ? (
                <span className="text-xs text-muted">{s.service.name}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {swapDialogShift && (
        <ShiftSwapDialog
          open
          onClose={() => setSwapDialogShift(null)}
          shift={swapDialogShift}
          currentUserId={userId}
          onSubmitted={() => {
            setSwapDialogShift(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
