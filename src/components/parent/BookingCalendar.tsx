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

const SESSION_LABELS: Record<string, string> = { bsc: "BSC", asc: "ASC", vc: "VC" };
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>("asc");

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
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  }

  function handleBookDay() {
    if (!selectedDate) return;
    bulkBooking.mutate({
      childId,
      serviceId,
      bookings: [{ date: selectedDate, sessionType: selectedSession }],
    });
    setSelectedDate(null);
  }

  return (
    <div className="space-y-4">
      {/* Month nav + session toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset((p) => p - 1)}
            className="p-1.5 rounded-lg hover:bg-[#F2EDE8] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-[#7c7c8a]" />
          </button>
          <span className="text-sm font-semibold text-[#1a1a2e] min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setMonthOffset((p) => p + 1)}
            className="p-1.5 rounded-lg hover:bg-[#F2EDE8] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-[#7c7c8a]" />
          </button>
        </div>

        <div className="flex rounded-lg border border-[#e8e4df] overflow-hidden">
          {(["bsc", "asc", "vc"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSelectedSession(st)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                selectedSession === st
                  ? "bg-[#004E64] text-white"
                  : "bg-white text-[#7c7c8a] hover:bg-[#F2EDE8]",
              )}
            >
              {SESSION_LABELS[st]}
            </button>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_NAMES.map((d) => (
          <span key={d} className="text-[10px] font-semibold text-[#7c7c8a] uppercase py-1">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={i} />;

          const dateStr = day.toISOString().split("T")[0];
          const bookingKey = `${dateStr}-${selectedSession}`;
          const booking = bookingMap.get(bookingKey);
          const avail = availMap.get(bookingKey);
          const isToday = dateStr === todayStr;
          const isPast = day < new Date(todayStr);
          const isSelected = dateStr === selectedDate;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          let bgClass = "bg-white hover:bg-[#F2EDE8]";
          let dotColor = "";

          if (booking) {
            if (booking.status === "confirmed") {
              bgClass = "bg-green-50 hover:bg-green-100";
              dotColor = "bg-green-500";
            } else if (booking.status === "requested") {
              bgClass = "bg-amber-50 hover:bg-amber-100";
              dotColor = "bg-amber-500";
            }
          } else if (avail && avail.available === 0) {
            bgClass = "bg-red-50";
            dotColor = "bg-red-400";
          } else if (avail && avail.available > 0 && !isPast && !isWeekend) {
            dotColor = "bg-gray-300";
          }

          return (
            <button
              key={i}
              onClick={() => !isPast && !isWeekend && handleDayClick(dateStr)}
              disabled={isPast || isWeekend}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-all",
                bgClass,
                isToday && "ring-2 ring-[#004E64]",
                isSelected && "ring-2 ring-[#FECE00]",
                (isPast || isWeekend) && "opacity-40 cursor-default",
              )}
            >
              <span className={cn("font-medium", isToday ? "text-[#004E64]" : "text-[#1a1a2e]")}>
                {day.getDate()}
              </span>
              {dotColor && (
                <span className={cn("w-1.5 h-1.5 rounded-full mt-0.5", dotColor)} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center text-[10px] text-[#7c7c8a]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Confirmed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Requested</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" />Available</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Full</span>
      </div>

      {/* Day detail + book action */}
      {selectedDate && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
          <p className="text-sm font-semibold text-[#1a1a2e]">
            {new Date(selectedDate).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            — {SESSION_LABELS[selectedSession]}
          </p>

          {bookingMap.get(`${selectedDate}-${selectedSession}`) ? (
            <p className="text-xs text-[#7c7c8a] mt-2">
              Already booked ({bookingMap.get(`${selectedDate}-${selectedSession}`)?.status})
            </p>
          ) : (
            <div className="mt-3">
              {(() => {
                const a = availMap.get(`${selectedDate}-${selectedSession}`);
                if (a && a.available === 0) {
                  return <p className="text-xs text-red-600">No spots available for this session.</p>;
                }
                return (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#7c7c8a]">
                      {a ? `${a.available} spot${a.available !== 1 ? "s" : ""} available` : "Availability unknown"}
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      iconLeft={<Calendar className="w-4 h-4" />}
                      loading={bulkBooking.isPending}
                      onClick={handleBookDay}
                    >
                      Request Booking
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
