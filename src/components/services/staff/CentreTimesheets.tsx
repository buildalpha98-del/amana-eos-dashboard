"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  WeekPicker,
  addDaysIso,
  currentWeekStartIso,
} from "@/components/roster/WeekPicker";
import { useRosterShifts } from "@/hooks/useRosterShifts";
import {
  useTimesheets,
  useTimesheet,
  useSubmitTimesheet,
  useApproveTimesheet,
  useGenerateFromTimeclock,
} from "@/hooks/useTimesheets";
import { isAdminRole } from "@/lib/role-permissions";
import {
  clockTime,
  compareShift,
  summarisePeople,
} from "@/lib/centre-timesheets";
import { serviceDateISO, SERVICE_TZ } from "@/lib/timezone";
import { exportToCsv } from "@/lib/csv-export";
import { toast } from "@/hooks/useToast";

const field =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground";
const hours = (minutes: number) => `${(minutes / 60).toFixed(2)} h`;
const difference = (minutes: number | null) =>
  minutes === null ? "Pending" : `${minutes > 0 ? "+" : ""}${minutes} min`;
const statusLabels = {
  ts_draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  exported_to_xero: "Exported",
  rejected: "Rejected",
};

export function CentreTimesheets({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const office = isAdminRole(session?.user?.role ?? "");
  const canApprove =
    office ||
    (session?.user?.role === "member" &&
      session.user.isCentreAccount === true &&
      session.user.serviceId === serviceId);
  const [weekStart, setWeekStart] = useState(currentWeekStartIso);
  const [person, setPerson] = useState("all");
  const [reviewOnly, setReviewOnly] = useState(false);
  const weekEnd = addDaysIso(weekStart, 6);
  const shifts = useRosterShifts(serviceId, weekStart);
  const sheets = useTimesheets({
    serviceId,
    weekEndingAfter: weekEnd,
    weekEndingBefore: weekEnd,
  });
  const sheet = sheets.data?.find((item) => item.serviceId === serviceId);
  const detail = useTimesheet(sheet?.id ?? null);
  const submit = useSubmitTimesheet();
  const approve = useApproveTimesheet();
  const generate = useGenerateFromTimeclock();
  const rows = (shifts.data?.shifts ?? []).map((shift) => compareShift(shift));
  const totals = summarisePeople(rows);
  const shown = rows.filter(
    (row) =>
      (person === "all" || row.shift.userId === person) &&
      (!reviewOnly || row.flags.length > 0),
  );
  const entries = detail.data?.entries ?? [];
  const busy = submit.isPending || approve.isPending || generate.isPending;
  const selfSubmitted = sheet?.submittedById === session?.user?.id;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Weekly timesheets
          </h2>
          <p className="mt-1 text-sm text-muted">
            Rostered and clocked hours · Monday to Sunday · Sydney time
          </p>
        </div>
        <WeekPicker
          weekStart={weekStart}
          includeWeekend
          onWeekChange={(week) => {
            setWeekStart(week);
            setPerson("all");
          }}
        />
      </div>

      <section
        aria-label="Payroll timesheet"
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Payroll timesheet</h3>
            <p className="text-sm text-muted">
              {sheets.isLoading
                ? "Loading…"
                : sheets.isError
                  ? "Couldn't load the timesheet."
                  : sheet
                    ? `${statusLabels[sheet.status]} · ${sheet._count.entries} entries`
                    : "No payroll timesheet for this week yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sheets.isError && (
              <Button variant="secondary" onClick={() => void sheets.refetch()}>
                Try again
              </Button>
            )}
            {office &&
              !sheets.isLoading &&
              !sheets.isError &&
              (!sheet || sheet.status === "ts_draft") && (
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    generate.mutate(
                      { serviceId, weekEnding: weekEnd },
                      {
                        onSuccess: (result) =>
                          toast({
                            description:
                              result.message ||
                              `${result.created} entries added; ${result.skipped} already present, ${result.incomplete} incomplete and ${result.unpriced} without a pay rate.`,
                          }),
                      },
                    )
                  }
                >
                  {generate.isPending
                    ? "Generating…"
                    : "Generate from timeclock"}
                </Button>
              )}
            {sheet?.status === "ts_draft" &&
              sheet._count.entries > 0 &&
              canApprove && (
                <Button
                  className="min-h-11"
                  disabled={busy || detail.isLoading || detail.isError}
                  onClick={() => submit.mutate(sheet.id)}
                >
                  Submit for approval
                </Button>
              )}
            {sheet?.status === "submitted" && canApprove && (
              <Button
                className="min-h-11"
                disabled={
                  busy || selfSubmitted || detail.isLoading || detail.isError
                }
                onClick={() => approve.mutate(sheet.id)}
              >
                {approve.isPending ? "Approving…" : "Approve timesheet"}
              </Button>
            )}
            {office && sheet && (
              <Button
                className="min-h-11"
                variant="secondary"
                disabled={detail.isLoading || detail.isError || !entries.length}
                onClick={() =>
                  exportToCsv(
                    `amana-timesheet-${serviceId}-${weekEnd}`,
                    entries,
                    [
                      { header: "Staff", accessor: (entry) => entry.user.name },
                      {
                        header: "Date",
                        accessor: (entry) => serviceDateISO(entry.date),
                      },
                      {
                        header: "Start (Sydney)",
                        accessor: (entry) => clockTime(entry.shiftStart),
                      },
                      {
                        header: "End (Sydney)",
                        accessor: (entry) => clockTime(entry.shiftEnd),
                      },
                      {
                        header: "Break minutes",
                        accessor: (entry) => entry.breakMinutes,
                      },
                      {
                        header: "Paid hours",
                        accessor: (entry) => entry.totalHours,
                      },
                      {
                        header: "Shift type",
                        accessor: (entry) => entry.shiftType,
                      },
                    ],
                  )
                }
              >
                Export CSV
              </Button>
            )}
          </div>
        </div>
        {selfSubmitted && sheet?.status === "submitted" && (
          <p className="text-sm text-muted">
            You submitted this timesheet. Another approver needs to sign it off.
          </p>
        )}
        {!office && !sheet && !sheets.isLoading && !sheets.isError && (
          <p className="text-sm text-muted">
            Head office can generate the payroll entries from completed
            clock-ins.
          </p>
        )}
        {sheet && (
          <details
            className="rounded-lg border border-border p-3"
            open={sheet.status === "submitted"}
          >
            <summary className="min-h-11 cursor-pointer font-medium text-foreground">
              Review payroll entries
            </summary>
            {detail.isError ? (
              <div role="alert">
                Couldn’t load payroll entries.{" "}
                <Button
                  variant="secondary"
                  onClick={() => void detail.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : detail.isLoading ? (
              <p className="text-sm text-muted">Loading entries…</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  Approval applies to these saved entries. Clock logs below show
                  elapsed time before unpaid breaks.
                </p>
                <ul className="space-y-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface p-3 text-sm"
                    >
                      <div>
                        <strong>{entry.user.name}</strong>
                        <p>
                          {serviceDateISO(entry.date)} ·{" "}
                          {clockTime(entry.shiftStart)}–
                          {clockTime(entry.shiftEnd)}
                        </p>
                      </div>
                      <div>
                        {Number(entry.totalHours).toFixed(2)} paid hours
                        <p className="text-muted">
                          {entry.breakMinutes} min break
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {entries.length === 0 && (
                  <p className="text-sm text-muted">No payroll entries yet.</p>
                )}
                {office && (
                  <Link
                    className="mt-3 inline-flex min-h-11 items-center font-medium text-brand underline"
                    href={`/timesheets?id=${sheet.id}`}
                  >
                    Open payroll editor
                  </Link>
                )}
              </>
            )}
          </details>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Rostered"
          value={
            shifts.isLoading || shifts.isError
              ? "—"
              : hours(rows.reduce((sum, row) => sum + row.rosterMinutes, 0))
          }
        />
        <Stat
          label="Completed clock hours"
          value={
            shifts.isLoading || shifts.isError
              ? "—"
              : hours(
                  rows.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0),
                )
          }
        />
        <Stat
          label="Shifts to review"
          value={
            shifts.isLoading || shifts.isError
              ? "—"
              : String(rows.filter((row) => row.flags.length).length)
          }
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-full text-sm text-muted sm:w-64">
          Staff
          <select
            className={field}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="all">All staff</option>
            {totals
              .filter((item) => !item.id.startsWith("unassigned:"))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
            className="h-5 w-5"
          />
          Only shifts to review
        </label>
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={() => void shifts.refetch()}
          disabled={shifts.isFetching}
        >
          Refresh clocks
        </Button>
      </div>
      <p className="text-sm text-muted">
        Clock hours exclude unfinished shifts and include breaks. Draft and
        unassigned shifts are marked for review.
      </p>
      {shifts.isError ? (
        <div role="alert" className="rounded-xl border border-border p-4">
          Couldn’t load clock logs. Use Refresh clocks to try again.
        </div>
      ) : shifts.isLoading ? (
        <p role="status">Loading clock logs…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-muted">
          No shifts match this week and filter.
        </p>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {shown.map((row) => (
              <article
                key={row.shift.id}
                className="space-y-3 rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <h3 className="font-semibold">{row.name}</h3>
                  <p className="text-sm text-muted">
                    {dayLabel(row.day)} · {row.shift.sessionType.toUpperCase()}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Rostered</dt>
                    <dd>
                      {row.shift.status === "unscheduled"
                        ? "—"
                        : `${row.shift.shiftStart}–${row.shift.shiftEnd}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Clocked</dt>
                    <dd>
                      {clockTime(row.shift.actualStart)}–
                      {clockTime(row.shift.actualEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Completed hours</dt>
                    <dd>
                      {row.actualMinutes === null
                        ? "Pending"
                        : hours(row.actualMinutes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Difference</dt>
                    <dd>{difference(row.difference)}</dd>
                  </div>
                </dl>
                <Flags flags={row.flags} />
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Weekly roster and clock comparison
              </caption>
              <thead className="bg-surface text-muted">
                <tr>
                  {[
                    "Staff",
                    "Day",
                    "Rostered",
                    "Clocked",
                    "Hours",
                    "Difference",
                    "Review",
                  ].map((label) => (
                    <th key={label} scope="col" className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.shift.id} className="border-t border-border">
                    <th scope="row" className="p-3 font-medium">
                      {row.name}
                      <p className="text-xs text-muted">
                        {row.shift.sessionType.toUpperCase()}
                      </p>
                    </th>
                    <td className="p-3 whitespace-nowrap">
                      {dayLabel(row.day)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.shift.status === "unscheduled"
                        ? "—"
                        : `${row.shift.shiftStart}–${row.shift.shiftEnd}`}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {clockTime(row.shift.actualStart)}–
                      {clockTime(row.shift.actualEnd)}
                    </td>
                    <td className="p-3">
                      {row.actualMinutes === null
                        ? "Pending"
                        : hours(row.actualMinutes)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {difference(row.difference)}
                    </td>
                    <td className="p-3">
                      <Flags flags={row.flags} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!shifts.isLoading && !shifts.isError && totals.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">
            Weekly totals by person
          </h3>
          <p className="text-sm text-muted">
            Whole week totals. Differences are final once all shifts have
            completed clocks.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {totals
              .filter((item) => person === "all" || item.id === person)
              .map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <h4 className="font-semibold">{item.name}</h4>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt>Rostered</dt>
                      <dd>{hours(item.rosterMinutes)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Completed clocks</dt>
                      <dd>{hours(item.actualMinutes)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Difference</dt>
                      <dd>
                        {difference(item.actualMinutes - item.rosterMinutes)}
                      </dd>
                    </div>
                  </dl>
                  {item.pending > 0 && (
                    <p className="mt-2 text-sm text-muted">
                      {item.pending} shift(s) pending completed clocks
                    </p>
                  )}
                </article>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function dayLabel(day: string) {
  return new Date(day).toLocaleDateString("en-AU", {
    timeZone: SERVICE_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold text-brand">
        {value}
      </p>
    </div>
  );
}
function Flags({ flags }: { flags: string[] }) {
  return flags.length ? (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-md bg-accent/20 px-2 py-1 text-xs font-medium text-foreground"
        >
          {flag}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-sm text-muted">No flags</span>
  );
}
