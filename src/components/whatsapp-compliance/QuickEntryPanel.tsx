"use client";

import { useMemo, useState } from "react";
import type { GridResponse } from "@/hooks/useWhatsAppCompliance";
import { useQuickEntry } from "@/hooks/useWhatsAppCompliance";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { CheckCircle2, MessageCircle } from "lucide-react";
import type { WhatsAppNonPostReason } from "@prisma/client";

interface QuickEntryPanelProps {
  grid: GridResponse;
}

interface RowState {
  posted: boolean;
  notPostingReason?: WhatsAppNonPostReason;
}

const REASON_OPTIONS: Array<{ value: WhatsAppNonPostReason; label: string }> = [
  { value: "coordinator_on_leave", label: "On leave" },
  { value: "coordinator_sick", label: "Sick" },
  { value: "school_closure", label: "School closed" },
  { value: "public_holiday", label: "Public holiday" },
  { value: "technical_issue", label: "Technical issue" },
  { value: "forgot_or_missed", label: "Forgot" },
  { value: "other", label: "Other" },
];

function dayLabelFor(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getUTCDay()];
}

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getQuickEntryDate(): { iso: string; label: string; isMonday: boolean } {
  const today = todayUtc();
  const day = today.getUTCDay();
  const back = day === 1 ? 3 : day === 0 ? 2 : day === 6 ? 1 : 1;
  const d = new Date(today.getTime() - back * 24 * 60 * 60 * 1000);
  const iso = d.toISOString().slice(0, 10);
  const dayName = dayLabelFor(d);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    iso,
    label: `${dayName} ${dd} ${months[d.getUTCMonth()]}`,
    isMonday: day === 1,
  };
}

export function QuickEntryPanel({ grid }: QuickEntryPanelProps) {
  const target = useMemo(() => getQuickEntryDate(), []);
  const targetIso = target.iso;

  const cellsForDate = grid.cells.filter((c) => c.date === targetIso);
  const allComplete = cellsForDate.length === grid.centres.length && cellsForDate.every((c) => c.record !== null);

  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const centre of grid.centres) {
      const existing = cellsForDate.find((c) => c.serviceId === centre.id)?.record;
      init[centre.id] = existing
        ? {
            posted: existing.posted,
            notPostingReason: existing.notPostingReason ?? undefined,
          }
        : { posted: false };
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(allComplete);

  const mutation = useQuickEntry();

  if (allComplete && !mutation.isPending && submitted) {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <strong>Yesterday&apos;s check-in complete</strong> — view in the grid below.
        </div>
        <p className="mt-1 text-xs text-green-800">
          {target.isMonday ? "Last Friday" : "Yesterday"} ({target.label}) is fully recorded.
        </p>
      </section>
    );
  }

  const toggleChecked = (serviceId: string, posted: boolean) => {
    setState((prev) => ({
      ...prev,
      [serviceId]: {
        posted,
        notPostingReason: posted ? undefined : prev[serviceId]?.notPostingReason,
      },
    }));
  };

  const setReason = (serviceId: string, reason: WhatsAppNonPostReason) => {
    setState((prev) => ({
      ...prev,
      [serviceId]: { posted: false, notPostingReason: reason },
    }));
  };

  const onSave = async () => {
    const entries = grid.centres.map((centre) => {
      const row = state[centre.id];
      return {
        serviceId: centre.id,
        posted: row.posted,
        notPostingReason: row.posted ? undefined : row.notPostingReason,
      };
    });
    try {
      await mutation.mutateAsync({ date: targetIso, entries });
      toast({ description: "Check-in saved" });
      setSubmitted(true);
    } catch {
      // hook handles its own toast
    }
  };

  const filledCount = Object.values(state).filter((r) => r.posted || r.notPostingReason).length;
  const canSave = filledCount > 0 && !mutation.isPending;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Quick Entry: {target.isMonday ? "Last Friday" : "Yesterday"} ({target.label})
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Tick the centres where the coordinator posted. For unticked centres, pick a reason.
          </p>
        </div>
        <span className="text-xs text-muted">
          {filledCount}/{grid.centres.length} marked
        </span>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {grid.centres.map((centre) => {
          const row = state[centre.id];
          return (
            <li
              key={centre.id}
              className={`rounded-lg border p-3 text-sm ${
                row.posted
                  ? "border-green-300 bg-green-50"
                  : row.notPostingReason
                  ? "border-amber-300 bg-amber-50"
                  : "border-border bg-surface"
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={row.posted}
                  onChange={(e) => toggleChecked(centre.id, e.target.checked)}
                  aria-label={`${centre.name} posted`}
                />
                <span className="flex-1">
                  <span className="font-medium text-foreground">{centre.name}</span>
                  {centre.coordinatorName && (
                    <span className="text-muted text-xs"> ({centre.coordinatorName})</span>
                  )}
                </span>
              </label>
              {!row.posted && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {REASON_OPTIONS.map((opt) => {
                    const active = row.notPostingReason === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReason(centre.id, opt.value)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          active
                            ? "bg-brand text-white border-brand"
                            : "bg-card text-muted border-border hover:text-foreground"
                        }`}
                        aria-pressed={active}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end pt-2 border-t border-border">
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={!canSave}
          loading={mutation.isPending}
        >
          Save check-in
        </Button>
      </div>
    </section>
  );
}
