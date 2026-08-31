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
  createdAt?: string | null;
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
  const [dates, setDates] = useState("");
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  // Report panel: its own window, and only fetched once asked for —
  // the default list is forward-looking, this is the "what did we close
  // last term" question.
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportOn, setReportOn] = useState(false);

  const { data } = useQuery<{ blockOutDates: BlockOutRow[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/block-out-dates`),
    retry: 1,
  });
  const rows = data?.blockOutDates ?? [];

  const report = useQuery<{ blockOutDates: BlockOutRow[] }>({
    queryKey: [...key, "report", reportFrom, reportTo],
    queryFn: () =>
      fetchApi(
        `/api/services/${serviceId}/block-out-dates?from=${reportFrom}&to=${reportTo}`,
      ),
    // Only runs once Get report is pressed, so changing a date doesn't
    // fire a query per keystroke.
    enabled: reportOn && Boolean(reportFrom && reportTo),
    retry: 1,
  });
  const reportRows = report.data?.blockOutDates ?? [];

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
      setDates("");
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

          {!dates.trim() && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeWeekends}
                onChange={(e) => setExcludeWeekends(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="text-sm text-foreground">
                Skip weekends
                <span className="block text-xs text-muted">
                  A three-week holiday range otherwise writes nine rows for
                  days you were never open.
                </span>
              </span>
            </label>
          )}

          <div>
            <label htmlFor="bo-dates" className="block text-sm font-medium text-foreground mb-1">
              Or list dates{" "}
              <span className="text-muted">(instead of a range)</span>
            </label>
            <input
              id="bo-dates"
              className={field}
              value={dates}
              onChange={(e) => setDates(e.target.value)}
              placeholder="e.g. 2026-10-31, 2026-11-07"
            />
            <p className="text-2xs text-muted mt-1">
              For the every-Wednesday shape a range can&apos;t express.
              Weekends listed here are kept — naming a Saturday means it.
            </p>
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
              onClick={() => {
                const list = dates
                  .split(",")
                  .map((d) => d.trim())
                  .filter(Boolean);
                create.mutate({
                  ...(list.length
                    ? { dates: list }
                    : {
                        date,
                        ...(endDate ? { endDate } : {}),
                        excludeWeekends,
                      }),
                  ...(sessionType ? { sessionType } : {}),
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                });
              }}
              disabled={create.isPending || (!date && !dates.trim())}
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

      {/* ── Report ──────────────────────────────────────────────────
          Separate from the list above because it answers a different
          question. The list is "what's coming"; this is "what did we
          close, and who closed it" — which needs the past and needs
          the name against each row. */}
      <div className="border-t border-border pt-4 space-y-3">
        <h4 className="text-sm font-medium text-foreground">
          Block-out report
        </h4>
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label
              htmlFor="bo-report-from"
              className="block text-xs font-medium text-muted mb-1"
            >
              From
            </label>
            <input
              id="bo-report-from"
              type="date"
              className={field}
              value={reportFrom}
              onChange={(e) => {
                setReportFrom(e.target.value);
                setReportOn(false);
              }}
            />
          </div>
          <div className="sm:col-span-4">
            <label
              htmlFor="bo-report-to"
              className="block text-xs font-medium text-muted mb-1"
            >
              To
            </label>
            <input
              id="bo-report-to"
              type="date"
              className={field}
              value={reportTo}
              onChange={(e) => {
                setReportTo(e.target.value);
                setReportOn(false);
              }}
            />
          </div>
          <div className="sm:col-span-4 flex items-end">
            <Button
              className="w-full"
              variant="outline"
              disabled={!reportFrom || !reportTo}
              onClick={() => setReportOn(true)}
            >
              Get report
            </Button>
          </div>
        </div>

        {reportOn &&
          (report.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : reportRows.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing was blocked out in that window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
                      Date
                    </th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
                      What&apos;s closed
                    </th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="py-2 pr-3 text-xs font-medium text-muted uppercase tracking-wider">
                      Added by
                    </th>
                    <th className="py-2 text-xs font-medium text-muted uppercase tracking-wider">
                      Date added
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportRows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 text-foreground whitespace-nowrap">
                        {dateAU(r.date)}
                      </td>
                      <td className="py-2 pr-3 text-muted">
                        {r.programmeName ?? "Whole centre"}
                      </td>
                      <td className="py-2 pr-3 text-muted">{r.reason ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted">
                        {r.createdBy ?? "—"}
                      </td>
                      <td className="py-2 text-muted whitespace-nowrap">
                        {r.createdAt ? dateAU(r.createdAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-2xs text-muted mt-2">
                {reportRows.length}{" "}
                {reportRows.length === 1 ? "day" : "days"} blocked out.
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
