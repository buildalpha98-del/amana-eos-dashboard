"use client";

/**
 * LeadershipForecastAlerts — projection warning chips (2026-07-06).
 *
 * Quiet by default: renders nothing until a centre is projected to hit
 * capacity or slide under target within the forecast horizon. Each
 * chip links to the Forecast view where the full trajectory lives.
 */

import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useForecast } from "@/hooks/useForecast";
import { StatusChip } from "@/components/ui/StatusChip";

export function LeadershipForecastAlerts() {
  const { data, isLoading, error } = useForecast();

  if (isLoading || error || !data || data.alerts.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      data-testid="leadership-forecast-alerts"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Projections
        </span>
        {data.alerts.map((a) => (
          <Link key={`${a.serviceId}-${a.kind}`} href="/performance?view=forecast">
            <StatusChip
              level={a.kind === "capacity" ? "now" : "soon"}
              icon={a.kind === "capacity" ? TrendingUp : TrendingDown}
              className="cursor-pointer px-2.5 py-1 transition-colors hover:brightness-95"
            >
              <span className="font-semibold">{a.serviceName}</span>&nbsp;{a.detail}
            </StatusChip>
          </Link>
        ))}
      </div>
    </section>
  );
}
