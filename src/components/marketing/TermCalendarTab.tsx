"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { useTermCalendar } from "@/hooks/useMarketing";
import type { TermCalendarEntry } from "@/hooks/useMarketing";
import { cn } from "@/lib/utils";

// ── Channel config ──────────────────────────────────────────

const CHANNELS = [
  { key: "social", label: "Social Media", color: "#1565C0" },
  { key: "canva", label: "Canva Design", color: "#7B1FA2" },
  { key: "newsletter", label: "Newsletter", color: "#00838F" },
  { key: "school_comms", label: "School Comms", color: "#2E7D32" },
  { key: "activation", label: "Activations", color: "#E65100" },
  { key: "whatsapp", label: "WhatsApp", color: "#388E3C" },
  { key: "compliance", label: "Compliance", color: "#546E7A" },
  { key: "holiday_quest", label: "Holiday Quest", color: "#AD1457" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-surface text-foreground/80",
  in_progress: "bg-blue-500 text-white",
  completed: "bg-emerald-500 text-white",
  skipped: "bg-red-100 text-red-600 line-through",
};

const NEWSLETTER_WEEKS = new Set([4, 9]);

function getCurrentTerm(): { year: number; term: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let term = 1;
  if (month >= 9) term = 4;
  else if (month >= 6) term = 3;
  else if (month >= 3) term = 2;
  return { year, term };
}

// ── Component ───────────────────────────────────────────────

interface TermCalendarTabProps {
  serviceId?: string;
}

export function TermCalendarTab({ serviceId }: TermCalendarTabProps) {
  const current = getCurrentTerm();
  const [year, setYear] = useState(current.year);
  const [term, setTerm] = useState(current.term);

  const { data, isLoading } = useTermCalendar(year, term, serviceId || undefined);

  const resetToCurrent = () => {
    const c = getCurrentTerm();
    setYear(c.year);
    setTerm(c.term);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  const totalEntries = data?.summary?.totalEntries ?? 0;

  if (totalEntries === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CalendarDays className="h-12 w-12 text-muted/50 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No term plan loaded</h3>
        <p className="text-sm text-muted max-w-md">
          The term calendar will be pre-loaded by Cowork at the start of each term.
          You can also add entries manually via the API.
        </p>
      </div>
    );
  }

  const { byStatus = {}, byChannel = {} } = data?.summary ?? {};

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        >
          {[current.year - 1, current.year, current.year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={term}
          onChange={(e) => setTerm(Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        >
          {[1, 2, 3, 4].map((t) => (
            <option key={t} value={t}>Term {t}</option>
          ))}
        </select>
        <button
          onClick={resetToCurrent}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white transition-colors"
        >
          Current Term
        </button>

        {/* Summary pills */}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
            {totalEntries} entries
          </span>
          {(byStatus.completed ?? 0) > 0 && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {byStatus.completed} done
            </span>
          )}
          {(byStatus.in_progress ?? 0) > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
              {byStatus.in_progress} in progress
            </span>
          )}
          {(byStatus.planned ?? 0) > 0 && (
            <span className="rounded-full bg-surface/50 px-2.5 py-1 text-muted">
              {byStatus.planned} planned
            </span>
          )}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <TermGrid weeks={data?.weeks ?? {}} />
      </div>

      {/* Mobile list */}
      <div className="md:hidden space-y-4">
        <TermMobileList weeks={data?.weeks ?? {}} />
      </div>
    </div>
  );
}

// ── Desktop Grid ────────────────────────────────────────────

function TermGrid({ weeks }: { weeks: Record<string, TermCalendarEntry[]> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-brand text-white">
          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide w-16">
            Week
          </th>
          {CHANNELS.map((ch) => (
            <th
              key={ch.key}
              className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
              style={{ borderLeft: `3px solid ${ch.color}` }}
            >
              {ch.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((week) => {
          const entries = weeks[String(week)] ?? [];
          const isNewsletter = NEWSLETTER_WEEKS.has(week);
          return (
            <tr
              key={week}
              className={cn(
                "border-t border-border/50",
                isNewsletter && "bg-amber-50/40",
                !isNewsletter && week % 2 === 0 && "bg-surface/50/60",
              )}
            >
              <td className="px-3 py-2 font-semibold text-foreground/80 align-top">
                W{week}
              </td>
              {CHANNELS.map((ch) => {
                const cellEntries = entries.filter((e) => e.channel === ch.key);
                return (
                  <td key={ch.key} className="px-2 py-2 align-top min-w-[120px]">
                    <CellContent entries={cellEntries} />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Cell Content ────────────────────────────────────────────

function CellContent({ entries }: { entries: TermCalendarEntry[] }) {
  if (entries.length === 0) {
    return <span className="text-muted/50 text-xs">&mdash;</span>;
  }

  if (entries.length === 1) {
    const e = entries[0];
    return (
      <div className="group relative" title={e.description || e.title}>
        <p className="text-xs text-foreground truncate max-w-[140px] leading-snug">
          {e.title}
        </p>
        <StatusBadge status={e.status} />
      </div>
    );
  }

  // Multiple entries
  return (
    <div className="space-y-1.5">
      {entries.slice(0, 2).map((e) => (
        <div key={e.id} title={e.description || e.title}>
          <p className="text-xs text-foreground truncate max-w-[140px] leading-snug">
            {e.title}
          </p>
          <StatusBadge status={e.status} />
        </div>
      ))}
      {entries.length > 2 && (
        <span className="text-[10px] text-muted">
          +{entries.length - 2} more
        </span>
      )}
    </div>
  );
}

// ── Status Badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return (
    <span
      className={cn(
        "inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none capitalize",
        STATUS_STYLES[status] ?? "bg-surface text-muted",
      )}
    >
      {label}
    </span>
  );
}

// ── Mobile List ─────────────────────────────────────────────

function TermMobileList({ weeks }: { weeks: Record<string, TermCalendarEntry[]> }) {
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((week) => {
        const entries = weeks[String(week)] ?? [];
        if (entries.length === 0) return null;

        return (
          <div key={week} className="rounded-xl border border-border overflow-hidden">
            <div className={cn(
              "px-4 py-2 font-semibold text-sm",
              NEWSLETTER_WEEKS.has(week)
                ? "bg-amber-50 text-amber-800"
                : "bg-surface/50 text-foreground/80",
            )}>
              Week {week}
            </div>
            <div className="divide-y divide-border/50">
              {entries.map((e) => {
                const ch = CHANNELS.find((c) => c.key === e.channel);
                return (
                  <div key={e.id} className="px-4 py-2.5 flex items-start gap-3">
                    <div
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ch?.color ?? "#9e9e9e" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{e.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted">{ch?.label ?? e.channel}</span>
                        <StatusBadge status={e.status} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
