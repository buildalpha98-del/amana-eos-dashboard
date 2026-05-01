"use client";

/**
 * OpenShiftsCard — surfaces unassigned shifts the current user can claim.
 * Lives on My Portal next to MyUpcomingShiftsCard.
 *
 * 2026-05-02: the staff-facing half of the open-shift workflow shipped
 * via PR #53. Without this card admins could create open shifts but
 * staff had no surface to find + claim them.
 *
 * Quiet by default: the card hides itself entirely when there are no
 * open shifts in the lookahead window, so it doesn't take up space on
 * a "fully rostered" My Portal.
 */

import { Sparkles, Loader2 } from "lucide-react";
import { useOpenShifts, useClaimShift, type OpenShift } from "@/hooks/useOpenShifts";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const SESSION_LABEL: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function OpenShiftsCard() {
  const { data, isLoading, error } = useOpenShifts();
  const claim = useClaimShift();

  // Hide the card entirely on an empty / errored state — there's no
  // value in showing "no open shifts" placeholder noise on My Portal.
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (error) return null;
  const shifts = data?.shifts ?? [];
  if (shifts.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <header className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-foreground">
          Open shifts you can claim
        </h3>
        <span className="ml-auto text-xs text-muted">
          {shifts.length} available
        </span>
      </header>

      <ul className="space-y-2">
        {shifts.map((s) => (
          <OpenShiftRow
            key={s.id}
            shift={s}
            onClaim={(id) => claim.mutate({ shiftId: id })}
            disabled={claim.isPending}
          />
        ))}
      </ul>
    </section>
  );
}

function OpenShiftRow({
  shift,
  onClaim,
  disabled,
}: {
  shift: OpenShift;
  onClaim: (id: string) => void;
  disabled: boolean;
}) {
  const sessionLabel = SESSION_LABEL[shift.sessionType] ?? shift.sessionType.toUpperCase();
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] uppercase tracking-wide text-muted">
          <span className="font-semibold text-foreground/80">{sessionLabel}</span>
          <span>·</span>
          <span>{formatDate(shift.date)}</span>
          <span>·</span>
          <span>{shift.shiftStart}–{shift.shiftEnd}</span>
        </div>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate">
          {shift.service?.name ?? "Service"}
          {shift.role ? <span className="text-muted font-normal"> · {shift.role}</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onClaim(shift.id)}
        disabled={disabled}
        className={cn(
          "min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5",
          "rounded-lg text-sm font-medium",
          "bg-brand text-white hover:bg-brand-hover transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {disabled ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Claim
      </button>
    </li>
  );
}
