"use client";

/**
 * MyClockCard — primary clock-in/out widget on My Portal.
 *
 * State machine (driven off `useQuery(["my-shifts"])`):
 *  - **Pre-shift in window** (within ±2h of next shiftStart, no
 *    actualStart yet) → big "Clock in" button + scheduled time
 *  - **Active** (actualStart set, actualEnd null) → big "Clock out"
 *    button + live elapsed-time read-out
 *  - **Out of window with no active shift** → card hidden entirely
 *  - **Ambiguous** (the /auto API came back with multiple
 *    candidates) → small picker showing each candidate
 *  - **Unscheduled fallback** (no eligible shift in window) →
 *    secondary link "I don't have a scheduled shift" → unscheduled
 *    POST
 *
 * 2026-05-04: timeclock v1, sub-PR 4.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, Loader2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import {
  useAutoClockIn,
  useClockIn,
  useClockOut,
  useUnscheduledClockIn,
} from "@/hooks/useTimeclock";
import { Button } from "@/components/ui/Button";
import { cn, toLocalIsoDate } from "@/lib/utils";
import { CLOCK_IN_WINDOW_MS, shiftStartMs } from "@/lib/timeclock-pick";

interface MineShift {
  id: string;
  serviceId: string;
  date: string;
  sessionType: string;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  service?: { id: string; name: string } | null;
}

interface MyClockCardProps {
  userId: string;
}

// Local-timezone dates (toISOString() is UTC and lands on the previous
// day for AU timezones in the morning). Yesterday is included so an
// overnight shift the user forgot to clock out of still surfaces its
// Clock out button; a week ahead matches the card's lookahead needs.
function clockWindowRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 1);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  return { from: toLocalIsoDate(start), to: toLocalIsoDate(end) };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "1h 23m" elapsed since `since`. */
function fmtElapsed(since: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - since.getTime());
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function MyClockCard({ userId }: MyClockCardProps) {
  const { from, to } = clockWindowRange();
  const { data, isLoading, error, refetch } = useQuery<{ shifts: MineShift[] }>({
    queryKey: ["my-shifts", userId, from, to],
    queryFn: () =>
      fetchApi<{ shifts: MineShift[] }>(
        `/api/roster/shifts/mine?from=${from}&to=${to}`,
      ),
    enabled: !!userId,
    retry: 2,
    refetchInterval: 60_000,
  });

  // Compute eligibility against `now` — refresh state every minute so a
  // shift entering its window doesn't require a hard reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const shifts = data?.shifts ?? [];

  // Currently-clocked-in shift (highest priority — the user can clock
  // out regardless of the time window).
  const activeShift = shifts.find((s) => s.actualStart && !s.actualEnd) ?? null;

  // Eligible shifts for clock-in (in ±2h window, not yet started).
  const eligible = useMemo(() => {
    return shifts.filter((s) => {
      if (s.actualStart) return false; // already clocked in
      const startMs = shiftStartMs({
        date: new Date(s.date),
        shiftStart: s.shiftStart,
        // unused by shiftStartMs:
        id: s.id,
        shiftEnd: s.shiftEnd,
        actualStart: null,
        actualEnd: null,
      });
      return Math.abs(now.getTime() - startMs) <= CLOCK_IN_WINDOW_MS;
    });
  }, [shifts, now]);

  const auto = useAutoClockIn();
  const clockOut = useClockOut(activeShift?.id ?? null);
  const explicitIn = useClockIn(eligible[0]?.id ?? null);
  const unscheduled = useUnscheduledClockIn();
  const pending =
    auto.isPending ||
    clockOut.isPending ||
    explicitIn.isPending ||
    unscheduled.isPending;

  // After auto returns ambiguous candidates, surface them.
  const ambiguousCandidates = auto.data?.ambiguous
    ? (auto.data.candidates ?? [])
    : [];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-5 w-24 bg-surface rounded mb-2" />
        <div className="h-12 w-full bg-surface rounded" />
      </div>
    );
  }

  // Never hide a failure: without this, a failed shifts fetch made the
  // whole card vanish and the clock-in button silently disappeared.
  if (error) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <header className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-foreground">Time clock</h3>
        </header>
        <p className="text-xs text-muted">
          Couldn&apos;t load your shifts, so clock in/out is unavailable.
        </p>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          className="w-full justify-center"
        >
          Try again
        </Button>
      </section>
    );
  }

  // Hide the card entirely when there's nothing to do — no active
  // shift AND no eligible window AND no ambiguous follow-up. Keeps
  // My Portal quiet on a non-shift day.
  if (
    !activeShift &&
    eligible.length === 0 &&
    ambiguousCandidates.length === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-foreground">
          {activeShift ? "On shift now" : "Time clock"}
        </h3>
      </header>

      {activeShift ? (
        <ActiveShiftView
          shift={activeShift}
          now={now}
          onClockOut={() => clockOut.mutate()}
          pending={pending}
        />
      ) : ambiguousCandidates.length > 0 ? (
        <AmbiguousCandidates
          candidates={ambiguousCandidates}
          onPick={(id) => {
            // explicit clock-in falls through useClockIn(eligible[0]),
            // but for ambiguous picks we fire a one-off mutation.
            void mutateApi(`/api/roster/shifts/${id}/clock-in`, {
              method: "POST",
            })
              .then(() => {
                // refetch handled by the query invalidation in the
                // useTimeclock hooks; no qc here.
                window.location.reload();
              })
              .catch((err: Error) => {
                toast({
                  variant: "destructive",
                  description: err.message || "Clock-in failed — try again.",
                });
              });
          }}
          pending={pending}
        />
      ) : (
        <PreShiftView
          shifts={eligible}
          onClockIn={() => auto.mutate()}
          onUnscheduled={() => unscheduled.mutate()}
          pending={pending}
        />
      )}
    </section>
  );
}

// ── State views ──────────────────────────────────────────────────

function ActiveShiftView({
  shift,
  now,
  onClockOut,
  pending,
}: {
  shift: MineShift;
  now: Date;
  onClockOut: () => void;
  pending: boolean;
}) {
  if (!shift.actualStart) return null;
  const elapsed = fmtElapsed(new Date(shift.actualStart), now);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Clocked in at <strong>{fmtTime(shift.actualStart)}</strong> ·{" "}
        {elapsed} elapsed · scheduled {shift.shiftStart}–{shift.shiftEnd}
      </p>
      <Button
        onClick={onClockOut}
        disabled={pending}
        variant="primary"
        size="md"
        className="w-full justify-center"
        iconLeft={pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
      >
        Clock out
      </Button>
    </div>
  );
}

function PreShiftView({
  shifts,
  onClockIn,
  onUnscheduled,
  pending,
}: {
  shifts: MineShift[];
  onClockIn: () => void;
  onUnscheduled: () => void;
  pending: boolean;
}) {
  const single = shifts[0];
  return (
    <div className="space-y-2">
      {single ? (
        <p className="text-xs text-muted">
          Next shift: <strong>{single.shiftStart}–{single.shiftEnd}</strong>
          {single.role ? ` · ${single.role}` : ""} ·{" "}
          {single.service?.name ?? "your service"}
        </p>
      ) : (
        <p className="text-xs text-muted">
          No scheduled shift in the next two hours.
        </p>
      )}
      {shifts.length > 0 && (
        <Button
          onClick={onClockIn}
          disabled={pending}
          variant="primary"
          size="md"
          className="w-full justify-center"
          iconLeft={pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        >
          Clock in
        </Button>
      )}
      <button
        type="button"
        onClick={onUnscheduled}
        disabled={pending}
        className={cn(
          "block w-full text-center text-xs text-muted hover:text-foreground",
          "underline underline-offset-2",
          pending && "opacity-50 cursor-not-allowed",
        )}
      >
        I don&apos;t have a scheduled shift — clock in unscheduled
      </button>
    </div>
  );
}

/** Minimal shape — API's ambiguous candidates don't include service/role
 *  in the generic `useTimeclock` response, so we accept the loose subset. */
interface CandidateShift {
  id: string;
  shiftStart: string;
  shiftEnd: string;
  role?: string | null;
}

function AmbiguousCandidates({
  candidates,
  onPick,
  pending,
}: {
  candidates: CandidateShift[];
  onPick: (shiftId: string) => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        You have multiple shifts in this window — pick the one you&apos;re starting.
      </p>
      <ul className="space-y-1">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              disabled={pending}
              className={cn(
                "w-full text-left rounded-lg border border-border bg-surface px-3 py-2",
                "hover:bg-surface-hover transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <span className="text-sm font-medium">
                {c.shiftStart}–{c.shiftEnd}
              </span>
              {c.role ? (
                <span className="text-xs text-muted ml-2">· {c.role}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
