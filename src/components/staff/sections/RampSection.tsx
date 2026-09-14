"use client";

/**
 * RampSection — the 90-day ramp on the long-scroll staff profile.
 * Sub-tabs: Scorecard · Weekly check-ins · Checkpoints. Only mounted when
 * the person has a StaffRamp (the server page checks). Managers/admins
 * submit 30/60/90 checkpoints inline; the starter sees everything except
 * the manager's free-text summaries.
 *
 * 2026-09-14: introduced (spec docs/superpowers/specs/2026-09-14-ninety-day-ramp-design.md).
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, Flag, MinusCircle } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  RAMP_COMPETENCIES,
  RAMP_FINAL_RECOMMENDATIONS,
  RAMP_INTERIM_RECOMMENDATIONS,
  RAMP_LENGTH_DAYS,
  RAMP_MOOD_LABELS,
  RAMP_RATING_LABELS,
  RAMP_RECOMMENDATION_LABELS,
} from "@/lib/ramp/constants";
import type { RampScorecard } from "@/lib/ramp/scorecard";
import {
  useRamp,
  useSubmitRampCheckpoint,
  type RampCheckInItem,
  type RampCheckpointItem,
} from "@/hooks/useRamp";

type SubTab = "scorecard" | "checkins" | "checkpoints";

const SUB_TABS = [
  { key: "scorecard", label: "Scorecard" },
  { key: "checkins", label: "Weekly check-ins" },
  { key: "checkpoints", label: "Checkpoints" },
] as const;

const OVERALL_STYLE: Record<RampScorecard["overall"], { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  needs_support: { label: "Needs support", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  at_risk: { label: "At risk", className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  extended: "Extended",
  completed: "Completed — probation passed",
  ended: "Ended",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function formatRowValue(row: RampScorecard["rows"][number], v: number | null): string {
  if (v == null) return "—";
  switch (row.format) {
    case "percent":
      return `${v}%`;
    case "boolean":
      return v ? "Yes" : "No";
    case "score":
      return `${v}/5`;
    default:
      return String(v);
  }
}

function RowStatusIcon({ status }: { status: RampScorecard["rows"][number]["status"] }) {
  if (status === "met") return <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Met" />;
  if (status === "behind") return <AlertTriangle className="w-4 h-4 text-red-600" aria-label="Behind" />;
  return <Circle className="w-4 h-4 text-muted" aria-label="Not yet due" />;
}

export function RampSection({ targetUserId, targetUserName }: { targetUserId: string; targetUserName: string }) {
  const { data, isLoading, error, refetch } = useRamp(targetUserId);

  return (
    <SectionShell<SubTab>
      sectionKey="ramp"
      title="90-day ramp"
      accentDotClass="bg-sky-500"
      accentActiveClass="bg-sky-100 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200"
      subTabs={SUB_TABS}
    >
      {(active) => {
        if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
        if (error) return <ErrorState title="Couldn't load the ramp" error={error as Error} onRetry={refetch} />;
        if (!data) return <p className="text-sm text-muted">No ramp for {targetUserName}.</p>;

        return (
          <div className="space-y-4">
            <RampHeader data={data} />
            {active === "scorecard" && <ScorecardTable scorecard={data.scorecard} />}
            {active === "checkins" && <CheckInTimeline checkIns={data.checkIns} />}
            {active === "checkpoints" && (
              <Checkpoints
                userId={targetUserId}
                checkpoints={data.checkpoints}
                canReview={data.permissions.canReview}
                rampStatus={data.ramp.status}
              />
            )}
          </div>
        );
      }}
    </SectionShell>
  );
}

function RampHeader({ data }: { data: NonNullable<ReturnType<typeof useRamp>["data"]> }) {
  const { ramp, scorecard } = data;
  const total = Math.max(RAMP_LENGTH_DAYS, Math.round((new Date(ramp.endDate).getTime() - new Date(ramp.startDate).getTime()) / 86_400_000));
  const pct = Math.min(100, Math.round((scorecard.day / total) * 100));
  const overall = OVERALL_STYLE[scorecard.overall];
  const closed = ramp.status === "completed" || ramp.status === "ended";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", overall.className)}>{overall.label}</span>
        <span className="text-muted">{STATUS_LABEL[ramp.status] ?? ramp.status}</span>
        <span className="text-muted">·</span>
        <span className="text-foreground font-medium">Day {Math.min(scorecard.day, total)} of {total}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">
          {fmtDate(ramp.startDate)} → {fmtDate(ramp.endDate)}
        </span>
        {scorecard.recentFlags > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300">
            <Flag className="w-3.5 h-3.5" /> {scorecard.recentFlags} flagged check-in{scorecard.recentFlags === 1 ? "" : "s"} in the last 14 days
          </span>
        )}
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-surface overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Ramp progress">
        <div className={cn("h-full rounded-full", closed ? "bg-muted" : "bg-sky-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScorecardTable({ scorecard }: { scorecard: RampScorecard }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Measure</th>
            <th className="py-2 pr-3 font-medium">Now</th>
            <th className="py-2 pr-3 font-medium text-center">Day 30</th>
            <th className="py-2 pr-3 font-medium text-center">Day 60</th>
            <th className="py-2 pr-3 font-medium text-center">Day 90</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {scorecard.rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <td className="py-2 pr-3">
                <div className="text-foreground">{row.label}</div>
                <div className="text-2xs text-muted">{row.hint}</div>
              </td>
              <td className="py-2 pr-3 font-medium text-foreground whitespace-nowrap">{formatRowValue(row, row.value)}</td>
              {([30, 60, 90] as const).map((stage) => (
                <td
                  key={stage}
                  className={cn("py-2 pr-3 text-center whitespace-nowrap", stage === scorecard.stage ? "text-foreground font-medium" : "text-muted")}
                >
                  {formatRowValue(row, row.targets[stage])}
                </td>
              ))}
              <td className="py-2">
                <span className="inline-flex items-center gap-1.5">
                  <RowStatusIcon status={row.status} />
                  <span className="text-xs text-muted capitalize">{row.status === "pending" ? "Not yet due" : row.status}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-2xs text-muted mt-2">Targets in force: day {scorecard.stage}. Computed live from training, compliance, roster and check-in data.</p>
    </div>
  );
}

function MoodDot({ mood }: { mood: number | null }) {
  if (mood == null) return <MinusCircle className="w-4 h-4 text-muted" aria-label="No answer" />;
  const cls = mood <= 2 ? "bg-red-500" : mood === 3 ? "bg-amber-500" : "bg-emerald-500";
  return <span className={cn("inline-block h-3 w-3 rounded-full", cls)} aria-label={`Mood ${mood}: ${RAMP_MOOD_LABELS[mood]}`} />;
}

function CheckInTimeline({ checkIns }: { checkIns: RampCheckInItem[] }) {
  if (checkIns.length === 0) return <p className="text-sm text-muted">No check-ins scheduled.</p>;
  return (
    <ol className="space-y-2">
      {checkIns.map((c) => {
        const state = c.submittedAt ? "answered" : c.skipped ? "skipped" : c.sentAt ? "sent" : "scheduled";
        return (
          <li key={c.id} className={cn("rounded-lg border border-border p-3", c.flaggedAt && "border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20")}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <MoodDot mood={c.mood} />
              <span className="font-medium text-foreground">Week {c.weekNumber}</span>
              <span className="text-muted">{fmtDate(c.dueAt)}</span>
              <span className="text-2xs uppercase tracking-wide text-muted ml-auto">
                {state === "answered" ? `Answered${c.mood != null ? ` · ${RAMP_MOOD_LABELS[c.mood]}` : ""}` : state === "sent" ? "Sent, awaiting reply" : state === "skipped" ? "Before ramp started" : "Scheduled"}
              </span>
              {c.needsHelp && (
                <span className="inline-flex items-center gap-1 text-2xs font-medium text-red-700 dark:text-red-300">
                  <Flag className="w-3 h-3" /> Asked for help
                </span>
              )}
            </div>
            {(c.wentWell || c.struggling || c.helpDetail) && (
              <dl className="mt-2 grid gap-1 text-sm">
                {c.wentWell && (<div><dt className="text-2xs text-muted">Went well</dt><dd className="text-foreground whitespace-pre-wrap">{c.wentWell}</dd></div>)}
                {c.struggling && (<div><dt className="text-2xs text-muted">Been hard</dt><dd className="text-foreground whitespace-pre-wrap">{c.struggling}</dd></div>)}
                {c.helpDetail && (<div><dt className="text-2xs text-muted">Needs</dt><dd className="text-foreground whitespace-pre-wrap">{c.helpDetail}</dd></div>)}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Checkpoints({
  userId,
  checkpoints,
  canReview,
  rampStatus,
}: {
  userId: string;
  checkpoints: RampCheckpointItem[];
  canReview: boolean;
  rampStatus: string;
}) {
  const closed = rampStatus === "completed" || rampStatus === "ended";
  // Snapshot once per mount — Date.now() in render is impure (lint rule).
  const [now] = useState(() => Date.now());
  return (
    <div className="space-y-3">
      {checkpoints.map((cp) => {
        const due = new Date(cp.dueAt).getTime() <= now;
        const avg = (() => {
          const vals = RAMP_COMPETENCIES.map((c) => cp.ratings?.[c.key]).filter((v): v is number => typeof v === "number");
          return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
        })();
        return (
          <div key={cp.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Day {cp.day}{cp.day >= RAMP_LENGTH_DAYS ? " — probation decision" : ""}</span>
              <span className="text-sm text-muted">due {fmtDate(cp.dueAt)}</span>
              {cp.submittedAt ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {cp.reviewer?.name ?? "Submitted"} · {fmtDate(cp.submittedAt)}
                </span>
              ) : due ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                  <Clock className="w-3.5 h-3.5" /> Awaiting manager
                </span>
              ) : (
                <span className="ml-auto text-xs text-muted">Upcoming</span>
              )}
            </div>

            {cp.submittedAt ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {RAMP_COMPETENCIES.map((c) => (
                    <span key={c.key} className="text-foreground">
                      <span className="text-muted">{c.label}:</span> {cp.ratings?.[c.key] ?? "—"}/5
                    </span>
                  ))}
                </div>
                <p className="text-foreground">
                  <span className="text-muted">Average:</span> {avg ?? "—"}{avg != null ? "/5" : ""} ·{" "}
                  <span className="text-muted">Recommendation:</span> {cp.recommendation ? RAMP_RECOMMENDATION_LABELS[cp.recommendation] : "—"}
                </p>
                {cp.summary && <p className="text-foreground whitespace-pre-wrap border-l-2 border-border pl-3">{cp.summary}</p>}
              </div>
            ) : canReview && !closed ? (
              <CheckpointForm userId={userId} day={cp.day} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CheckpointForm({ userId, day }: { userId: string; day: number }) {
  const final = day >= RAMP_LENGTH_DAYS;
  const options = final ? RAMP_FINAL_RECOMMENDATIONS : RAMP_INTERIM_RECOMMENDATIONS;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState("");
  const [recommendation, setRecommendation] = useState<string>("");
  const submit = useSubmitRampCheckpoint(userId);
  const complete = RAMP_COMPETENCIES.every((c) => ratings[c.key]) && !!recommendation;

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        submit.mutate({
          day,
          ratings,
          summary: summary.trim() || undefined,
          recommendation: recommendation as (typeof options)[number],
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {RAMP_COMPETENCIES.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-foreground">{c.label}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={ratings[c.key] === v}
                  title={RAMP_RATING_LABELS[v]}
                  onClick={() => setRatings((r) => ({ ...r, [c.key]: v }))}
                  className={cn(
                    "h-8 w-8 rounded-md border text-xs font-medium",
                    ratings[c.key] === v ? "bg-brand text-white border-brand" : "bg-card text-foreground border-border hover:bg-surface",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs text-muted block mb-1" htmlFor={`cp-summary-${day}`}>
          Summary {final ? "(pre-fills their probation review)" : "(optional)"}
        </label>
        <textarea
          id={`cp-summary-${day}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Recommendation">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={recommendation === opt}
            onClick={() => setRecommendation(opt)}
            className={cn(
              "px-3 py-1.5 rounded-full border text-xs font-medium",
              recommendation === opt ? "bg-brand text-white border-brand" : "bg-card text-foreground border-border hover:bg-surface",
            )}
          >
            {RAMP_RECOMMENDATION_LABELS[opt]}
          </button>
        ))}
      </div>

      <Button type="submit" disabled={!complete || submit.isPending}>
        {submit.isPending ? "Submitting…" : final ? "Submit probation decision" : `Submit day ${day} checkpoint`}
      </Button>
    </form>
  );
}
