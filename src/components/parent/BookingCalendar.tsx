"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { programmeName } from "@/lib/programme-names";

// ── Types ────────────────────────────────────────────────

interface AvailabilityEntry {
  date: string;
  sessionType: string;
  booked: number;
  capacity: number;
  available: number;
}

interface BookingEntry {
  id: string;
  date: string;
  sessionType: string;
  status: string;
  type: string;
}

interface BookingCalendarProps {
  childId: string;
  serviceId: string;
  bookings: BookingEntry[];
}

/**
 * Short codes are fine HERE — a calendar cell has room for a word, not a
 * room name. The full name shows in the booking dialog and on the
 * centre page, where there's space to say it properly.
 */
/** Order the day panel lists sessions in — morning before afternoon. */
/**
 * Order sessions appear in. Includes the four spare slots so a centre
 * that has named one shows it here too; unnamed slots simply never have
 * bookings or availability, so they render nothing.
 */
const SESSION_ORDER = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Hooks ────────────────────────────────────────────────

function useAvailability(serviceId: string, month: string) {
  return useQuery<AvailabilityEntry[]>({
    queryKey: ["booking-availability", serviceId, month],
    queryFn: () =>
      fetchApi<AvailabilityEntry[]>(
        `/api/parent/bookings/availability?serviceId=${serviceId}&month=${month}`,
      ),
    enabled: !!serviceId && !!month,
    staleTime: 60_000,
    retry: 2,
  });
}

function useBulkBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      childId: string;
      serviceId: string;
      bookings: Array<{ date: string; sessionType: string }>;
    }) => mutateApi("/api/parent/bookings/bulk", { method: "POST", body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking-availability"] });
      queryClient.invalidateQueries({ queryKey: ["parent-bookings"] });
      toast({ description: "Booking request submitted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to submit booking" });
    },
  });
}

// ── Helpers ──────────────────────────────────────────────

function getMonthDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  // Monday = 0, Tuesday = 1, etc.
  let startPad = firstDay.getDay() - 1;
  if (startPad < 0) startPad = 6; // Sunday wraps to end

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: startPad }, () => null);

  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end to fill last row
  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

// ── Component ────────────────────────────────────────────

export function BookingCalendar({ childId, serviceId, bookings }: BookingCalendarProps) {
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  /**
   * Days the family is picking, not just one.
   *
   * A parent booking casual care almost never wants a single day — it's
   * "Tuesday and Thursday next week while I'm working". Booking them one
   * at a time meant four taps and four confirmations for two days.
   */
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = viewDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const { data: availability } = useAvailability(serviceId, monthKey);
  const bulkBooking = useBulkBooking();

  const days = useMemo(
    () => getMonthDays(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate.getFullYear(), viewDate.getMonth()],
  );

  // Build lookup maps
  const bookingMap = useMemo(() => {
    const map = new Map<string, BookingEntry>();
    for (const b of bookings) {
      const key = `${b.date.split("T")[0]}-${b.sessionType}`;
      map.set(key, b);
    }
    return map;
  }, [bookings]);

  const availMap = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>();
    for (const a of availability ?? []) {
      map.set(`${a.date}-${a.sessionType}`, a);
    }
    return map;
  }, [availability]);

  const todayStr = now.toISOString().split("T")[0];

  function handleDayClick(dateStr: string) {
    setSelectedDates((prev) =>
      prev.includes(dateStr)
        ? prev.filter((d) => d !== dateStr)
        : [...prev, dateStr].sort(),
    );
  }

  /**
   * Book ONE named programme on the selected day.
   *
   * Takes the session explicitly. With the per-programme toggle gone
   * there is no "current" one to fall back on, and silently defaulting
   * to afternoons would book a family into the wrong session — the kind
   * of mistake you only find out about at 6:30am.
   */
  function handleBookDay(sessionType: string) {
    if (selectedDates.length === 0) return;
    // One request for the lot — the endpoint already took an array; the
    // UI was just only ever sending it one.
    bulkBooking.mutate({
      childId,
      serviceId,
      bookings: selectedDates.map((date) => ({ date, sessionType })),
    });
    setSelectedDates([]);
  }

  return (
    <div className="space-y-4">
      {/* Month nav + session toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset((p) => p - 1)}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-muted" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setMonthOffset((p) => p + 1)}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/*
          The per-programme toggle is gone (2026-08-04). A family with a
          child in Rise and Shine AND Amana Afternoons had to flip
          between two calendars to see one day, and the toggle looked
          like a filter on what was booked rather than a view switch.
          Every programme now shows at once, one dot each.
        */}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_NAMES.map((d) => (
          <span key={d} className="text-2xs font-semibold text-muted uppercase py-1">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={i} />;

          const dateStr = day.toISOString().split("T")[0];
          // Every session booked that day, so two sessions render two dots.
          const dayBookings = SESSION_ORDER.map((st) => ({
            sessionType: st,
            booking: bookingMap.get(`${dateStr}-${st}`),
          })).filter((x) => x.booking);
          const avail = availMap.get(`${dateStr}-asc`);
          const isToday = dateStr === todayStr;
          const isPast = day < new Date(todayStr);
          const isSelected = selectedDates.includes(dateStr);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          let bgClass = "bg-card hover:bg-surface";
          const dots: string[] = [];

          if (dayBookings.length > 0) {
            // Tinted by the "weakest" state on the day — one session still
            // awaiting confirmation shouldn't read as a settled day.
            const anyRequested = dayBookings.some(
              (x) => x.booking?.status === "requested",
            );
            bgClass = anyRequested
              ? "bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/50"
              : "bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-950/50";
            for (const x of dayBookings) {
              dots.push(
                x.booking?.status === "requested"
                  ? "bg-amber-500"
                  : "bg-green-500",
              );
            }
          } else if (avail && avail.available === 0) {
            bgClass = "bg-red-50 dark:bg-red-950/40";
            dots.push("bg-red-400");
          } else if (avail && avail.available > 0 && !isPast && !isWeekend) {
            dots.push("bg-muted/30");
          }

          return (
            <button
              key={i}
              onClick={() => !isPast && !isWeekend && handleDayClick(dateStr)}
              disabled={isPast || isWeekend}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-all",
                bgClass,
                isToday && "ring-2 ring-brand",
                isSelected && "ring-2 ring-accent",
                (isPast || isWeekend) && "opacity-40 cursor-default",
              )}
            >
              <span className={cn("font-medium", isToday ? "text-brand" : "text-foreground")}>
                {day.getDate()}
              </span>
              {dots.length > 0 && (
                <span className="flex items-center gap-0.5 mt-0.5">
                  {dots.map((c, di) => (
                    <span
                      key={di}
                      className={cn("w-1.5 h-1.5 rounded-full", c)}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nothing else says you can pick more than one, and a calendar
          that takes multiple taps looks broken until you know. */}
      <p className="text-center text-2xs text-muted">
        Tap any day — pick several to book them together.
      </p>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center text-2xs text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Confirmed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Requested</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted/30" />Available</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Full</span>
      </div>

      {/* Selection panel. Shows what's already booked when a single day
          is picked; once two or more are selected it becomes a request
          for the set, because that's the point of picking several. */}
      {selectedDates.length > 0 && (
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedDates.length === 1
                ? new Date(selectedDates[0]).toLocaleDateString("en-AU", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : `${selectedDates.length} days selected`}
            </p>
            <button
              onClick={() => setSelectedDates([])}
              className="text-xs text-muted underline underline-offset-2 min-h-11"
            >
              Clear
            </button>
          </div>

          {selectedDates.length > 1 && (
            <p className="mt-1 text-xs text-muted">
              {selectedDates
                .map((d) =>
                  new Date(d).toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }),
                )
                .join(" · ")}
            </p>
          )}

          {(() => {
            // Existing bookings are only meaningful for ONE day — across
            // a set they'd be a wall of statuses nobody reads.
            if (selectedDates.length === 1) {
              const day = selectedDates[0];
              const booked = SESSION_ORDER.map((st) => ({
                st,
                booking: bookingMap.get(`${day}-${st}`),
              })).filter((x) => x.booking);

              if (booked.length > 0) {
                return (
                  <ul className="mt-2 space-y-1">
                    {booked.map(({ st, booking }) => (
                      <li
                        key={st}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            booking?.status === "requested"
                              ? "bg-amber-500"
                              : "bg-green-500",
                          )}
                        />
                        {programmeName(st)}
                        <span className="text-xs text-muted ml-auto">
                          {booking?.status === "requested"
                            ? "Pending"
                            : "Confirmed"}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              }
            }

            // Which programmes still have room on EVERY selected day —
            // offering one that's full on the Thursday would fail half
            // the request after they'd pressed the button.
            const open = SESSION_ORDER.filter((st) =>
              selectedDates.every((d) => {
                const a = availMap.get(`${d}-${st}`);
                return !a || a.available > 0;
              }),
            );

            if (open.length === 0) {
              return (
                <p className="text-xs text-red-600 mt-2">
                  No programme has spots on every day you&apos;ve picked.
                </p>
              );
            }

            return (
              <div className="mt-3 space-y-2">
                {open.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant="outline"
                    className="w-full justify-between"
                    loading={bulkBooking.isPending}
                    onClick={() => handleBookDay(st)}
                  >
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Request {programmeName(st)}
                    </span>
                    <span className="text-xs text-muted">
                      {selectedDates.length === 1
                        ? "1 day"
                        : `${selectedDates.length} days`}
                    </span>
                  </Button>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
