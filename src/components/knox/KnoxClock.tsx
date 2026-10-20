"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { clockLabel, formatCountdown, formatKnoxTime } from "@/lib/knox/format";
import type { KnoxClockData } from "@/hooks/useKnox";

/** Re-render every 30 s so countdowns stay honest while the panel is open. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function KnoxClock({ clock }: { clock: KnoxClockData }) {
  const now = useNow();
  const { text, overdue } = formatCountdown(clock.dueAt, now, clock.overdue);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <Timer className={cn("h-4 w-4 shrink-0", overdue ? "text-danger" : "text-muted")} aria-hidden />
      <span className="font-medium text-foreground">{clockLabel(clock.kind)}</span>
      <span className={cn("font-semibold", overdue ? "text-danger" : "text-foreground")}>{text}</span>
      <span className="text-xs text-muted">
        {formatKnoxTime(clock.dueAt)}
        {clock.basis && ` · ${clock.basis}`}
      </span>
    </div>
  );
}
