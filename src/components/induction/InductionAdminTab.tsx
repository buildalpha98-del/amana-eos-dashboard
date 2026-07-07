"use client";

import { useState } from "react";
import {
  Users,
  ShieldCheck,
  CalendarDays,
  Rocket,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Loader2,
  Trash2,
  Plus,
} from "lucide-react";
import {
  useInductionPipeline,
  useInductionReadiness,
  useSignoffPractical,
  useLaunchBackfill,
  type PipelineRow,
} from "@/hooks/useInduction";
import {
  useTrainingCalendar,
  useAddCalendarSlot,
  useRemoveCalendarSlot,
} from "@/hooks/useTrainingCalendar";
import { useLMSCourses } from "@/hooks/useLMS";
import { Skeleton } from "@/components/ui/Skeleton";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STAGES: { key: string; label: string; hint: string }[] = [
  { key: "new_starter", label: "New starters", hint: "Not begun" },
  { key: "in_training", label: "In training", hint: "Working through courses" },
  { key: "awaiting_signoff", label: "Awaiting sign-off", hint: "Ready for practical" },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    new_starter: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    in_training: "bg-brand/10 text-brand border-brand/30",
    awaiting_signoff: "bg-green-500/10 text-green-600 border-green-500/30",
  };
  return map[status] ?? "bg-surface text-muted border-border";
}

/** Sign-off card — loads the user's practical checklist and lets a signer tick items. */
function SignoffCard({ row }: { row: PipelineRow }) {
  const { data, isLoading } = useInductionReadiness(row.id);
  const signoff = useSignoffPractical();

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted">{row.serviceName ?? "—"}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>
          {row.status.replace("_", " ")}
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <>
          {data && data.blockers.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              Training not finished: {data.blockers.map((b) => b.label).join(", ")}
            </div>
          )}
          <ul className="space-y-1.5">
            {(data?.practical ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  {item.signed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted" />
                  )}
                  {item.title}
                </span>
                {!item.signed && (
                  <button
                    onClick={() => signoff.mutate({ userId: row.id, itemId: item.id })}
                    disabled={signoff.isPending}
                    className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    Sign off
                  </button>
                )}
              </li>
            ))}
            {data && data.practical.length === 0 && (
              <li className="text-xs text-muted">No practical checklist items configured.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export function InductionAdminTab({ canBackfill }: { canBackfill: boolean }) {
  const { data: pipeline, isLoading } = useInductionPipeline();
  const backfill = useLaunchBackfill();
  const [confirmBackfill, setConfirmBackfill] = useState(false);

  const rows = pipeline?.rows ?? [];
  const awaiting = rows.filter((r) => r.status === "awaiting_signoff");
  const byStage = (key: string) => rows.filter((r) => r.status === key);

  return (
    <div className="space-y-10">
      {/* Backfill launcher */}
      {canBackfill && (
        <section className="rounded-xl border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <Rocket className="h-4 w-4 text-brand" />
                Backfill existing staff
              </h3>
              <p className="mt-1 text-sm text-muted">
                Enrol all current staff in the essential training with a 5-week grace period. They keep working during grace; after it, the gate applies.
              </p>
            </div>
            {confirmBackfill ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => { backfill.mutate(); setConfirmBackfill(false); }}
                  disabled={backfill.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {backfill.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm launch
                </button>
                <button onClick={() => setConfirmBackfill(false)} className="rounded-md border border-border px-3 py-2 text-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBackfill(true)}
                className="shrink-0 rounded-md border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10"
              >
                Launch backfill
              </button>
            )}
          </div>
        </section>
      )}

      {/* Pipeline board */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <Users className="h-4 w-4" />
          Induction pipeline
        </h3>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/50 p-8 text-center text-muted">
            Nobody is currently in induction. New starters and backfilled staff will appear here.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {STAGES.map((stage) => (
              <div key={stage.key} className="rounded-xl border border-border bg-surface/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{stage.label}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                    {byStage(stage.key).length}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted">{stage.hint}</p>
                <ul className="space-y-2">
                  {byStage(stage.key).map((r) => (
                    <li key={r.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-sm font-medium text-foreground">{r.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Clock className="h-3 w-3" />
                        {r.daysInStage}d in stage{r.serviceName ? ` · ${r.serviceName}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sign-off queue */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <ShieldCheck className="h-4 w-4" />
          Practical sign-off queue
        </h3>
        {awaiting.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/50 p-6 text-center text-sm text-muted">
            No one is awaiting practical sign-off right now.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {awaiting.map((r) => (
              <SignoffCard key={r.id} row={r} />
            ))}
          </div>
        )}
      </section>

      {/* Training calendar */}
      <TrainingCalendarEditor />
    </div>
  );
}

function TrainingCalendarEditor() {
  const { data: slots, isLoading } = useTrainingCalendar();
  const { data: courses } = useLMSCourses("published");
  const addSlot = useAddCalendarSlot();
  const removeSlot = useRemoveCalendarSlot();
  const [pick, setPick] = useState<Record<number, string>>({});

  const monthlyCourses = ((courses ?? []) as unknown as { id: string; title: string; track?: string }[])
    .filter((c) => c.track === "monthly");

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <CalendarDays className="h-4 w-4" />
        Annual training calendar
      </h3>
      <p className="mb-4 text-sm text-muted">
        Each month, the monthly cron auto-assigns these courses to all cleared staff.
      </p>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MONTHS.map((label, i) => {
            const month = i + 1;
            const monthSlots = (slots ?? []).filter((s) => s.month === month);
            return (
              <div key={month} className="rounded-xl border border-border bg-surface/50 p-3">
                <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
                <ul className="mb-2 space-y-1">
                  {monthSlots.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-foreground">{s.course.title}</span>
                      <button
                        onClick={() => removeSlot.mutate(s.id)}
                        className="shrink-0 text-muted hover:text-red-500"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                  {monthSlots.length === 0 && (
                    <li className="text-xs text-muted">No course assigned</li>
                  )}
                </ul>
                <div className="flex items-center gap-1.5">
                  <select
                    value={pick[month] ?? ""}
                    onChange={(e) => setPick((p) => ({ ...p, [month]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Add course…</option>
                    {monthlyCourses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                  <button
                    disabled={!pick[month] || addSlot.isPending}
                    onClick={() => {
                      if (pick[month]) {
                        addSlot.mutate({ month, courseId: pick[month] });
                        setPick((p) => ({ ...p, [month]: "" }));
                      }
                    }}
                    className="shrink-0 rounded-md bg-brand p-1.5 text-white hover:bg-brand-hover disabled:opacity-40"
                    aria-label="Add"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
