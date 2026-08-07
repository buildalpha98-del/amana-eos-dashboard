"use client";

/**
 * The casual spot grid — a week at a time, a row per room per day.
 *
 * OWNA shows one row per SEAT: twenty rows for twenty spots, generated
 * ahead by a job. We show one row per day with the seats accounted for
 * on it — who's in, how many are left — because a coordinator's question
 * is "how many left on Thursday", not "who is in seat 14".
 *
 * Setting capacity works across a date range, which is the actual job:
 * "twenty spots in Holiday Quest, every weekday of the school holidays".
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Lock, LockOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  activeSessionKeys,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface SpotRow {
  date: string;
  sessionType: string;
  roomName: string;
  enabled: boolean;
  runsToday: boolean;
  spots: number;
  vacant: number;
  booked: Array<{ bookingId: string; childName: string; status: string }>;
  closed: boolean;
  hasOverride: boolean;
  note: string | null;
  blockedReason: string | null;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Monday of the week containing `d`, as YYYY-MM-DD. */
function weekStart(d: Date): string {
  const copy = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
  const dow = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return copy.toISOString().slice(0, 10);
}
const addDays = (ymd: string, n: number) =>
  new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86400_000)
    .toISOString()
    .slice(0, 10);

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function CasualSpotsGrid({
  serviceId,
  sessionTimes,
  canEdit,
}: {
  serviceId: string;
  sessionTimes: SessionTimes | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => weekStart(new Date()));
  const to = addDays(from, 6);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRoom, setBulkRoom] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkSpots, setBulkSpots] = useState("");
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);

  const key = ["service", serviceId, "casual-spots", from];
  const { data, isLoading } = useQuery<{ rows: SpotRow[] }>({
    queryKey: key,
    queryFn: () =>
      fetchApi(`/api/services/${serviceId}/casual-spots?from=${from}&to=${to}`),
    retry: 1,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["service", serviceId, "casual-spots"] });

  const write = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/casual-spots`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      invalidate();
      setBulkOpen(false);
      setBulkSpots("");
      toast({ description: "Spots updated." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const clear = useMutation({
    mutationFn: ({ date, sessionType }: { date: string; sessionType: string }) =>
      mutateApi(
        `/api/services/${serviceId}/casual-spots?date=${date}&sessionType=${sessionType}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidate();
      toast({ description: "Back to the room's usual." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const rooms = activeSessionKeys(sessionTimes);
  const rows = (data?.rows ?? []).filter((r) => r.enabled);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFrom(addDays(from, -7))}
          >
            ← Previous
          </Button>
          <span className="text-sm font-medium text-foreground">
            {dayLabel(from)} – {dayLabel(to)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFrom(addDays(from, 7))}
          >
            Next →
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFrom(weekStart(new Date()))}
          >
            This week
          </Button>
        </div>
        {canEdit && !bulkOpen && (
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <CalendarPlus className="h-3 w-3" /> Set spots
          </Button>
        )}
      </div>

      {bulkOpen && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="cs-room" className="block text-sm font-medium text-foreground mb-1">
                Room
              </label>
              <select
                id="cs-room"
                className={field}
                value={bulkRoom}
                onChange={(e) => setBulkRoom(e.target.value)}
              >
                <option value="">Choose…</option>
                {rooms.map((r) => (
                  <option key={r} value={r}>
                    {roomLabel(sessionTimes, r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cs-from" className="block text-sm font-medium text-foreground mb-1">
                From
              </label>
              <input
                id="cs-from"
                type="date"
                className={field}
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cs-to" className="block text-sm font-medium text-foreground mb-1">
                To
              </label>
              <input
                id="cs-to"
                type="date"
                className={field}
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cs-spots" className="block text-sm font-medium text-foreground mb-1">
                Spots per day
              </label>
              <input
                id="cs-spots"
                type="number"
                min={0}
                inputMode="numeric"
                className={field}
                value={bulkSpots}
                onChange={(e) => setBulkSpots(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={weekdaysOnly}
              onChange={(e) => setWeekdaysOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            Weekdays only
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                write.mutate({
                  sessionType: bulkRoom,
                  from: bulkFrom,
                  to: bulkTo,
                  spots: Number(bulkSpots),
                  ...(weekdaysOnly ? { weekdays: [1, 2, 3, 4, 5] } : {}),
                })
              }
              disabled={
                write.isPending ||
                !bulkRoom ||
                !bulkFrom ||
                !bulkTo ||
                bulkSpots.trim() === ""
              }
            >
              {write.isPending ? "Setting…" : "Set spots"}
            </Button>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No room takes casual bookings yet. Switch one on in the settings
          above and its spots will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface/60">
              <tr>
                {["Day", "Room", "Spots", "Left", "Booked", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const unavailable = Boolean(r.blockedReason) || !r.runsToday;
                return (
                  <tr
                    key={`${r.date}-${r.sessionType}`}
                    className={unavailable ? "opacity-60" : undefined}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-foreground">
                      {dayLabel(r.date)}
                    </td>
                    <td className="px-3 py-2 text-foreground">{r.roomName}</td>
                    <td className="px-3 py-2 text-foreground">
                      {r.blockedReason ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          Closed — {r.blockedReason}
                        </span>
                      ) : !r.runsToday ? (
                        <span className="text-muted">Doesn&apos;t run</span>
                      ) : (
                        <>
                          {r.spots}
                          {r.hasOverride && (
                            <span className="ml-1 text-2xs text-brand">set</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.blockedReason || !r.runsToday ? (
                        <span className="text-muted">—</span>
                      ) : r.closed ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          Held
                        </span>
                      ) : (
                        <span
                          className={
                            r.vacant === 0
                              ? "text-muted"
                              : "font-medium text-foreground"
                          }
                        >
                          {r.vacant}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.booked.length === 0
                        ? "—"
                        : r.booked.map((b) => b.childName).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canEdit && !r.blockedReason && r.runsToday && (
                        <>
                          <button
                            type="button"
                            title={
                              r.closed
                                ? "Open for online booking"
                                : "Hold — staff can still place children"
                            }
                            aria-label={
                              r.closed
                                ? `Open ${r.roomName} on ${r.date}`
                                : `Hold ${r.roomName} on ${r.date}`
                            }
                            onClick={() =>
                              write.mutate({
                                sessionType: r.sessionType,
                                from: r.date,
                                to: r.date,
                                closed: !r.closed,
                              })
                            }
                            className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
                          >
                            {r.closed ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {r.hasOverride && (
                            <button
                              type="button"
                              title="Back to the room's usual"
                              aria-label={`Reset ${r.roomName} on ${r.date}`}
                              onClick={() =>
                                clear.mutate({
                                  date: r.date,
                                  sessionType: r.sessionType,
                                })
                              }
                              className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
