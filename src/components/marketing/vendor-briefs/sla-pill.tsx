"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { SlaState } from "@/lib/vendor-brief/sla";

const STYLES: Record<
  SlaState,
  { className: string; label: string; letter: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  on_track: {
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "On track",
    letter: "OK",
    Icon: CheckCircle2,
  },
  ack_overdue: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Ack overdue",
    letter: "A",
    Icon: Clock,
  },
  quote_overdue: {
    className: "bg-orange-50 text-orange-700 border-orange-200",
    label: "Quote overdue",
    letter: "Q",
    Icon: Clock,
  },
  delivery_overdue: {
    className: "bg-rose-50 text-rose-700 border-rose-200",
    label: "Delivery overdue",
    letter: "D",
    Icon: AlertTriangle,
  },
  breached: {
    className: "bg-rose-100 text-rose-800 border-rose-300",
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
