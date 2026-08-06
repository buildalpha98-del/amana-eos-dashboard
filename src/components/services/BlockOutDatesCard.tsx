"use client";

/**
 * Days the centre — or one room — isn't running.
 *
 * The alternative a coordinator has today is switching casual bookings
 * off entirely for a single pupil-free day, which closes every other day
 * with it. This is the smaller instrument.
 *
 * A range creates one row per day rather than a start/end pair, because
 * every read path (the booking check, the calendar) asks "is THIS day
 * blocked" and a per-day row answers that with an index hit instead of
 * an overlap comparison.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  activeSessionKeys,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface BlockOutRow {
  id: string;
  date: string;
  sessionType: string | null;
  programmeName: string | null;
  reason: string | null;
  createdBy: string | null;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function BlockOutDatesCard({
  serviceId,
  sessionTimes,
  canEdit,
}: {
  serviceId: string;
  sessionTimes: SessionTimes | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "block-out-dates"];
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [reason, setReason] = useState("");

  const { data } = useQuery<{ blockOutDates: BlockOutRow[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/block-out-dates`),
    retry: 1,
  });
  const rows = data?.blockOutDates ?? [];

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi<{ created: number }>(
        `/api/services/${serviceId}/block-out-dates`,
        { method: "POST", body },
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setDate("");
      setEndDate("");
      setSessionType("");
      setReason("");
      toast({
        description: `Blocked out — families can't book ${
          res.created > 1 ? `those ${res.created} days` : "that day"
        }.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (blockOutId: string) =>
      mutateApi(
        `/api/services/${serviceId}/block-out-dates?blockOutId=${blockOutId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Re-opened." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const programmes = activeSessionKeys(sessionTimes);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <CalendarOff className="h-4 w-4 text-brand" />
            Block-out dates
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Days you&apos;re not running — pupil-free days, closures. Families
            can&apos;t book them, and the refusal says why.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Block out
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="bo-from" className="block text-sm font-medium text-foreground mb-1">
                From
              </label>
              <input
                id="bo-from"
                type="date"
                className={field}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="bo-to" className="block text-sm font-medium text-foreground mb-1">
                To <span className="text-muted">(same day if blank)</span>
              </label>
              <input
                id="bo-to"
                type="date"
                className={field}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="bo-room" className="block text-sm font-medium text-foreground mb-1">
              What&apos;s closed
            </label>
            <select
              id="bo-room"
              className={field}
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
            >
              <option value="">The whole centre</option>
              {programmes.map((p) => (
                <option key={p} value={p}>
                  {roomLabel(sessionTimes, p)} only
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bo-reason" className="block text-sm font-medium text-foreground mb-1">
              Why <span className="text-muted">(families see this)</span>
            </label>
            <input
              id="bo-reason"
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. pupil-free day, staff training"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() =>
                create.mutate({
                  date,
                  ...(endDate ? { endDate } : {}),
                  ...(sessionType ? { sessionType } : {}),
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                })
              }
              disabled={create.isPending || !date}
            >
              {create.isPending ? "Blocking…" : "Block out"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing blocked out. Every day you run is bookable.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {dateAU(r.date)}
                </p>
                <p className="text-xs text-muted">
                  {r.programmeName ?? "Whole centre"}
                  {r.reason && ` · ${r.reason}`}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove.mutate(r.id)}
                  aria-label={`Re-open ${dateAU(r.date)}`}
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground min-h-11 min-w-11"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
