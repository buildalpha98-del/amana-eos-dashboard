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
import { cn } from "@/lib/utils";

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
          <Link
            key={`${a.serviceId}-${a.kind}`}
            href="/performance?view=forecast"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              a.kind === "capacity"
                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
          >
            {a.kind === "capacity" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span className="font-semibold">{a.serviceName}</span> {a.detail}
          </Link>
        ))}
      </div>
    </section>
  );
}
