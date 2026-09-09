"use client";

/**
 * SessionSnapshot — the "right now" strip on /my-day (Staff Portal v2
 * Phase 2, per MobileMyDay.dc.html): in care / booked / educators on,
 * one glanceable row.
 *
 * Reads the same centre-day query as the roll-call callout (shared
 * cache entry via useCentreDay). Quiet on failure — My Day still has a
 * clock and a roll-call link, and those matter more than this strip.
 * The page only mounts it when the user has a service.
 */

import { Skeleton } from "@/components/ui/Skeleton";
import { useCentreDay } from "./useCentreDay";

export function SessionSnapshot({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useCentreDay(serviceId);

  if (isLoading) {
    return <Skeleton className="h-[72px] w-full rounded-2xl" />;
  }
  if (!data) return null;

  const educators = data.staff.onDuty.length;
  const stats = [
    { label: "in care", value: data.totals.inCare },
    { label: "booked", value: data.totals.booked },
    {
      label: educators === 1 ? "educator on" : "educators on",
      value: educators,
    },
  ];

  return (
    <div
      className="flex items-center justify-around rounded-2xl border border-border bg-card px-4 py-3.5"
      data-testid="session-snapshot"
    >
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <p className="font-heading text-xl font-bold text-foreground">
            {s.value}
          </p>
          <p className="text-2xs text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
