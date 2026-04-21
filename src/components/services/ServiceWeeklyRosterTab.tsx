"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { useRoster, type RosterChild } from "@/hooks/useRoster";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { ServiceWeeklyShiftsGrid } from "./ServiceWeeklyShiftsGrid";
import { cn } from "@/lib/utils";

interface ServiceWeeklyRosterTabProps {
  serviceId: string;
  serviceName?: string;
}

const SESSION_LABELS: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("en-AU", opts)} – ${friday.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

function getWeekDates(monday: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function ServiceWeeklyRosterTab({ serviceId, serviceName }: ServiceWeeklyRosterTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawSub = searchParams?.get("sub") ?? "bookings";
  const sub: "bookings" | "shifts" = rawSub === "shifts" ? "shifts" : "bookings";

  const setSub = (next: "bookings" | "shifts") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("sub", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const [weekOffset, setWeekOffset] = useState(0);
  const [sessionType, setSessionType] = useState("asc");

  const monday = useMemo(() => {
    const m = getMondayOfWeek(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekStart = monday.toISOString().split("T")[0];
  const weekDates = useMemo(() => getWeekDates(monday), [monday]);

  const { data: roster, isLoading, error } = useRoster(serviceId, weekStart);

  return (
    <div className="space-y-4">
      {/* Sub-pill: Bookings vs Shifts */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setSub("bookings")}
          className={cn(
            "px-4 py-2 text-sm transition-colors",
            sub === "bookings"
              ? "border-b-2 border-brand font-medium text-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          Bookings
        </button>
        <button
          type="button"
          onClick={() => setSub("shifts")}
          className={cn(
            "px-4 py-2 text-sm transition-colors",
            sub === "shifts"
              ? "border-b-2 border-brand font-medium text-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          Shifts
        </button>
      </div>

      {sub === "shifts" && (
        <ServiceWeeklyShiftsGrid serviceId={serviceId} serviceName={serviceName} />
      )}

      {sub === "bookings" && (
        <BookingsView
          isLoading={isLoading}
          error={error}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          monday={monday}
          weekDates={weekDates}
          sessionType={sessionType}
          setSessionType={setSessionType}
          roster={roster}
        />
      )}
    </div>
  );
}

interface BookingsViewProps {
  isLoading: boolean;
  error: Error | null;
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  monday: Date;
  weekDates: string[];
  sessionType: string;
  setSessionType: React.Dispatch<React.SetStateAction<string>>;
  roster: Record<string, Record<string, RosterChild[]>> | undefined;
}

function BookingsView({
  isLoading,
  error,
  weekOffset,
  setWeekOffset,
  monday,
  weekDates,
  sessionType,
  setSessionType,
  roster,
}: BookingsViewProps) {
  return (
    <div className="space-y-4">
      {/* Week Navigator + Session Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronLeft className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p - 1)}
            aria-label="Previous week"
          />
          <span className="text-sm font-medium text-foreground min-w-[200px] text-center">
            {formatWeekRange(monday)}
          </span>
          <Button
            size="xs"
            variant="secondary"
            iconLeft={<ChevronRight className="w-4 h-4" />}
            onClick={() => setWeekOffset((p) => p + 1)}
            aria-label="Next week"
          />
          {weekOffset !== 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setWeekOffset(0)}
            >
              Today
            </Button>
          )}
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["bsc", "asc", "vc"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSessionType(st)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                sessionType === st
                  ? "bg-brand text-white"
                  : "bg-card text-muted hover:bg-surface"
              }`}
            >
              {SESSION_LABELS[st]}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Grid */}
      {isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          {/* Desktop: 5-column grid */}
          <div className="hidden sm:grid grid-cols-5 gap-3">
            {weekDates.map((dateStr, i) => {
              const dayChildren = roster?.[dateStr]?.[sessionType] ?? [];
              const dayDate = new Date(dateStr);
              return (
                <DayColumn
                  key={dateStr}
                  dayName={WEEKDAY_NAMES[i]}
                  dayNumber={dayDate.getUTCDate()}
                  children={dayChildren}
                  isToday={dateStr === new Date().toISOString().split("T")[0]}
                />
              );
            })}
          </div>

          {/* Mobile: scrollable cards */}
          <div className="sm:hidden space-y-3">
            {weekDates.map((dateStr, i) => {
              const dayChildren = roster?.[dateStr]?.[sessionType] ?? [];
              const dayDate = new Date(dateStr);
              return (
                <div
                  key={dateStr}
                  className={`bg-card border rounded-xl p-3 ${
                    dateStr === new Date().toISOString().split("T")[0]
                      ? "border-brand"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">
                      {WEEKDAY_NAMES[i]} {dayDate.getUTCDate()}
                    </span>
                    <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">
                      {dayChildren.length} children
                    </span>
                  </div>
                  {dayChildren.length === 0 ? (
                    <p className="text-xs text-muted">No bookings</p>
                  ) : (
                    <div className="space-y-1">
                      {dayChildren.map((child) => (
                        <ChildPill key={child.childId} child={child} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DayColumn({
  dayName,
  dayNumber,
  children,
  isToday,
}: {
  dayName: string;
  dayNumber: number;
  children: RosterChild[];
  isToday: boolean;
}) {
  return (
    <div
      className={`bg-card border rounded-xl p-3 ${
        isToday ? "border-brand ring-1 ring-brand/20" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold ${isToday ? "text-brand" : "text-foreground"}`}>
            {dayName}
          </span>
          <span
            className={`text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              isToday ? "bg-brand text-white" : "bg-surface text-muted"
            }`}
          >
            {dayNumber}
          </span>
        </div>
        <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded-full flex items-center gap-1">
          <Users className="w-3 h-3" />
          {children.length}
        </span>
      </div>

      {children.length === 0 ? (
        <p className="text-xs text-muted text-center py-4">No bookings</p>
      ) : (
        <div className="space-y-1">
          {children.map((child) => (
            <ChildPill key={child.childId} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildPill({ child }: { child: RosterChild }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-surface text-xs">
      <span className="font-medium text-foreground truncate flex-1">
        {child.firstName} {child.surname.charAt(0)}.
      </span>
      {child.hasMedical && (
        <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" aria-label="Medical alert" />
      )}
      {child.hasDietary && (
        <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" aria-label="Dietary" />
      )}
      {child.bookingType === "casual" && (
        <span className="text-[9px] font-semibold bg-blue-50 text-blue-600 px-1 py-0.5 rounded shrink-0">
          C
        </span>
      )}
    </div>
  );
}
