"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { SlaState } from "@/lib/vendor-brief/sla";

const STYLES: Record<
  SlaState,
  { className: string; label: string; letter: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  on_track: {
    className: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    label: "On track",
    letter: "OK",
    Icon: CheckCircle2,
  },
  ack_overdue: {
    className: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    label: "Ack overdue",
    letter: "A",
    Icon: Clock,
  },
  quote_overdue: {
    className: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    label: "Quote overdue",
    letter: "Q",
    Icon: Clock,
  },
  delivery_overdue: {
    className: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    label: "Delivery overdue",
    letter: "D",
    Icon: AlertTriangle,
  },
  breached: {
    className: "bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-800",
    label: "SLA breached",
    letter: "!",
    Icon: AlertTriangle,
  },
};

/**
 * SLA pill — colour + icon + letter cue (colour-blind safe).
 */
export function SlaPill({ state }: { state: SlaState }) {
  const s = STYLES[state];
  const Icon = s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${s.className}`}
      aria-label={s.label}
      title={s.label}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="hidden sm:inline">{s.label}</span>
      <span className="sm:hidden font-mono">{s.letter}</span>
    </span>
  );
}
