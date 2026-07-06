"use client";

/**
 * ForecastView — the forward-looking half of /performance (2026-07-06).
 *
 * Everything else on the page reports the past; this view projects the
 * next 4–8 weeks: per-centre occupancy trajectory (linear fit over 12
 * weeks of average daily attendance) and expected enrolments from the
 * open enquiry pipeline. Centres projected to hit capacity or slide
 * under target surface first.
 */

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Users,
  Target,
} from "lucide-react";
import { useForecast, type ServiceForecastData } from "@/hooks/useForecast";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  new_enquiry: "New enquiry",
  info_sent: "Info sent",
  nurturing: "Nurturing",
  form_started: "Form started",
};

function TrendBadge({ trend }: { trend: "growing" | "flat" | "declining" }) {
  const config = {
    growing: { icon: TrendingUp, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Growing" },
    flat: { icon: Minus, cls: "bg-surface text-muted border-border", label: "Flat" },
    declining: { icon: TrendingDown, cls: "bg-red-50 text-red-700 border-red-200", label: "Declining" },
  }[trend];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", config.cls)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function UtilisationBar({ now, horizon }: { now: number | null; horizon: number | null }) {
  if (now === null) return <span className="text-xs text-muted">no capacity set</span>;
  const nowPct = Math.min(100, Math.round(now * 100));
  const horizonPct = horizon === null ? nowPct : Math.min(100, Math.round(horizon * 100));
  return (
    <div className="w-full min-w-[120px]">
      <div className="mb-0.5 flex justify-between text-[10px] text-muted">
        <span>{nowPct}% now</span>
        <span className={cn(horizonPct >= 95 && "font-semibold text-red-600")}>{horizonPct}% projected</span>
      </div>
      <div className="relative h-2 rounded-full bg-border">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            horizonPct >= 95 ? "bg-red-400" : horizonPct >= 80 ? "bg-amber-400" : "bg-emerald-400",
          )}
          style={{ width: `${horizonPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          style={{ width: `${nowPct}%` }}
        />
      </div>
    </div>
  );
}

function ServiceRow({ s, weeksAhead }: { s: ServiceForecastData; weeksAhead: number }) {
  const f = s.forecast;
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-3">
        <Link href={`/services/${s.serviceId}`} className="text-sm font-medium text-foreground hover:text-brand">
          {s.serviceName}
        </Link>
        <span className="ml-1.5 text-xs text-muted">{s.code}</span>
      </td>
      {f ? (
        <>
          <td className="py-2.5 pr-3"><TrendBadge trend={f.trend} /></td>
          <td className="py-2.5 pr-3 text-right text-sm text-foreground">
            {f.current}
            <span className="text-xs text-muted"> avg/day</span>
          </td>
          <td className="py-2.5 pr-3 text-right text-sm text-foreground">
            {f.points[f.points.length - 1]?.projected ?? "—"}
            <span className="text-xs text-muted"> in {weeksAhead}w</span>
          </td>
          <td className="py-2.5 pr-3"><UtilisationBar now={f.utilisationNow} horizon={f.utilisationAtHorizon} /></td>
          <td className="py-2.5 text-right">
            {f.weeksToCapacity !== null && f.weeksToCapacity <= weeksAhead ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-3 w-3" />
                {f.weeksToCapacity === 0 ? "at capacity" : `~${f.weeksToCapacity}w to capacity`}
              </span>
            ) : (
              <span className="text-xs text-muted">—</span>
            )}
          </td>
        </>
      ) : (
        <td colSpan={5} className="py-2.5 text-xs italic text-muted">
          Not enough attendance history yet (needs 4+ weeks)
        </td>
      )}
    </tr>
  );
}

export function ForecastView() {
  const [weeks, setWeeks] = useState(8);
  const { data, isLoading, error, refetch } = useForecast(weeks);

  if (error) {
    return <ErrorState title="Failed to load forecast" error={error as Error} onRetry={refetch} />;
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const forecastable = data.services.filter((s) => s.forecast);
  const growing = forecastable.filter((s) => s.forecast!.trend === "growing").length;
  const declining = forecastable.filter((s) => s.forecast!.trend === "declining").length;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Centres growing" value={growing} valueColor="text-emerald-600" />
        <StatCard title="Centres declining" value={declining} valueColor={declining > 0 ? "text-red-600" : undefined} />
        <StatCard title="Capacity alerts" value={data.alerts.filter((a) => a.kind === "capacity").length} valueColor="text-amber-600" />
        <StatCard title="Expected enrolments" value={data.pipeline.expectedEnrolments} valueColor="text-brand" />
      </div>

      {/* Occupancy projections */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" />
            <h3 className="text-lg font-semibold text-foreground">Occupancy — next {data.weeksAhead} weeks</h3>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
            {[4, 6, 8].map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  weeks === w ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>
        {data.services.length === 0 ? (
          <EmptyState icon={Users} title="No active services" description="Forecasts appear once attendance data accumulates." variant="inline" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Centre</th>
                  <th className="py-2 pr-3 font-medium">Trend</th>
                  <th className="py-2 pr-3 text-right font-medium">Now</th>
                  <th className="py-2 pr-3 text-right font-medium">Projected</th>
                  <th className="py-2 pr-3 font-medium">Utilisation</th>
                  <th className="py-2 text-right font-medium">Capacity ETA</th>
                </tr>
              </thead>
              <tbody>
                {[...data.services]
                  .sort((a, b) => {
                    // Alert-worthy first: capacity ETA asc, then declining, then name.
                    const aEta = a.forecast?.weeksToCapacity ?? Infinity;
                    const bEta = b.forecast?.weeksToCapacity ?? Infinity;
                    if (aEta !== bEta) return aEta - bEta;
                    return a.serviceName.localeCompare(b.serviceName);
                  })
                  .map((s) => (
                    <ServiceRow key={s.serviceId} s={s} weeksAhead={data.weeksAhead} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Linear projection over the last 12 weeks of average daily attendance (attended + casual). Term-break weeks are included, so read holiday periods with judgement.
        </p>
      </section>

      {/* Pipeline forecast */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Target className="h-5 w-5 text-brand" />
          <h3 className="text-lg font-semibold text-foreground">Enquiry pipeline — expected enrolments</h3>
          {data.pipeline.ratesSource === "observed" ? (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Observed rates · {data.pipeline.observedSampleSize} journeys
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted"
              title="Real per-stage rates switch on automatically once 30 enquiry journeys resolve (stage events started logging 2026-07-06)."
            >
              Heuristic rates
            </span>
          )}
        </div>
        {data.pipeline.baseRate === null ? (
          <EmptyState icon={Target} title="No resolved enquiries yet" description="Conversion rates appear once enquiries have converted or gone cold." variant="inline" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.pipeline.byStage.map((st) => (
                <div key={st.stage} className="rounded-lg bg-surface p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{st.open}</p>
                  <p className="text-xs text-muted">{STAGE_LABELS[st.stage] ?? st.stage}</p>
                  <p className="mt-1 text-xs text-brand">≈ {st.expected} enrol at {Math.round(st.rate * 100)}%</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-foreground">
              <span className="font-semibold">{data.pipeline.expectedEnrolments} expected enrolments</span>{" "}
              <span className="text-muted">
                from {data.pipeline.openTotal} open enquiries (historical conversion {Math.round((data.pipeline.baseRate ?? 0) * 100)}%).
              </span>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
