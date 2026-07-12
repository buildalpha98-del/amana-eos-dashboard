import Link from "next/link";

interface TimesheetSummary {
  weekEnding: Date;
  totalHours: number;
  status: string;
}

interface TimesheetTabProps {
  targetUserId: string;
  weeks: TimesheetSummary[];
  canSubmit: boolean;
}

function formatWeekLabel(weekEnding: Date): string {
  const end = new Date(weekEnding);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_STYLES: Record<string, string> = {
  ts_draft: "bg-surface text-foreground/80",
  ts_submitted: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200",
  ts_approved: "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-200",
  ts_exported: "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200",
};

export function TimesheetTab({ targetUserId, weeks, canSubmit }: TimesheetTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Recent timesheets</h3>
          <div className="flex items-center gap-2">
            {canSubmit && (
              <Link
                href="/timesheets"
                className="text-sm text-brand hover:underline"
              >
                Submit hours
              </Link>
            )}
            <Link
              href={`/timesheets?userId=${targetUserId}`}
              className="text-sm text-muted hover:text-foreground"
            >
              View all
            </Link>
          </div>
        </div>

        {weeks.length === 0 ? (
          <p className="text-sm text-muted">No timesheet entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Week</th>
                  <th className="py-2 pr-3 font-medium">Hours</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weeks.map((w, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-foreground">
                      {formatWeekLabel(w.weekEnding)}
                    </td>
                    <td className="py-2 pr-3 text-foreground font-medium">
                      {w.totalHours.toFixed(1)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[w.status] ?? "bg-surface text-foreground/80"
                        }`}
                      >
                        {humanize(w.status).replace("Ts ", "")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
