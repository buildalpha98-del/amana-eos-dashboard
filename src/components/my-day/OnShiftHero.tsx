"use client";

/**
 * OnShiftHero — the /my-day clock slot (Staff Portal v2 Phase 2, per
 * MobileMyDay.dc.html).
 *
 * While a shift is actively clocked in it renders the dark on-shift
 * banner: green live dot, "clocked in HH:MM", an elapsed timer that
 * recomputes each minute, and the Clock out action via `useClockOut`.
 * In every other state (loading, fetch error, pre-shift window,
 * ambiguous picker, quiet day) it defers to the existing MyClockCard so
 * that behaviour keeps living in exactly one place.
 *
 * CACHE: subscribes to the IDENTICAL React Query entry as MyClockCard —
 * `myShiftsQueryKey` + `clockWindowRange` are imported from the card —
 * so mounting the hero never double-fetches a mismatched window.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { useClockOut } from "@/hooks/useTimeclock";
import { Button } from "@/components/ui/Button";
import {
  MyClockCard,
  clockWindowRange,
  fmtElapsed,
  myShiftsQueryKey,
  type MineShift,
} from "@/components/my-portal/MyClockCard";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OnShiftHero({ userId }: { userId: string }) {
  const { from, to } = clockWindowRange();
  const { data } = useQuery<{ shifts: MineShift[] }>({
    queryKey: myShiftsQueryKey(userId, from, to),
    queryFn: () =>
      fetchApi<{ shifts: MineShift[] }>(
        `/api/roster/shifts/mine?from=${from}&to=${to}`,
      ),
    enabled: !!userId,
    retry: 2,
    refetchInterval: 60_000,
  });

  // Per-minute tick so the elapsed read-out advances between refetches.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const activeShift =
    data?.shifts.find((s) => s.actualStart && !s.actualEnd) ?? null;
  const clockOut = useClockOut(activeShift?.id ?? null);

  // Not clocked in (or still loading / errored / ambiguous) — the
  // existing card owns all of those states. Success invalidation in
  // useClockOut refetches this same query, which swaps the hero out.
  if (!activeShift?.actualStart) {
    return <MyClockCard userId={userId} />;
  }

  return (
    <section
      className="flex items-center justify-between gap-4 rounded-2xl bg-sidebar p-5 text-white shadow-[var(--shadow-warm-lg)]"
      data-testid="on-shift-hero"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
            aria-hidden
          />
          <p className="text-xs text-white/80">
            On shift · clocked in {fmtTime(activeShift.actualStart)}
          </p>
        </div>
        <p className="mt-1 font-heading text-3xl font-bold leading-none tracking-tight">
          {fmtElapsed(new Date(activeShift.actualStart), now)}
        </p>
        <p className="mt-1.5 truncate text-xs text-white/60">
          Scheduled {activeShift.shiftStart}–{activeShift.shiftEnd}
          {activeShift.service?.name ? ` · ${activeShift.service.name}` : ""}
        </p>
      </div>
      <Button
        onClick={() => clockOut.mutate()}
        disabled={clockOut.isPending}
        variant="secondary"
        size="md"
        className="shrink-0 border-white/35 bg-transparent text-white hover:bg-white/10 hover:text-white"
        iconLeft={
          clockOut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )
        }
      >
        Clock out
      </Button>
    </section>
  );
}
