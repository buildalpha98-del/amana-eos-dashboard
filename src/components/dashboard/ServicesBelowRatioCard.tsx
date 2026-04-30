"use client";

/**
 * ServicesBelowRatioCard — org-wide alert card that shows which services are
 * currently below their NQS minimum ratio. Queries the hourly snapshot table
 * for the most-recent snapshot per service+session and flags any row with
 * `belowRatio=true`.
 *
 * Placement: dashboard top strip. Dismissible per-session (no persistence).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface BelowRatioRow {
  serviceId: string;
  serviceName: string;
  sessionType: "bsc" | "asc" | "vc";
  ratioText: string;
  capturedAt: string;
}

export function ServicesBelowRatioCard() {
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<{ items: BelowRatioRow[] }>({
    queryKey: ["services-below-ratio"],
    queryFn: () =>
      fetchApi<{ items: BelowRatioRow[] }>("/api/dashboard/below-ratio"),
    retry: 2,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const items = data?.items ?? [];
  if (dismissed || items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-rose-300 bg-rose-50/70",
        "p-3 flex items-start gap-3",
      )}
    >
      <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rose-900">
          {items.length} service{items.length === 1 ? "" : "s"} below ratio right now
        </p>
        <ul className="mt-1 space-y-0.5">
          {items.slice(0, 5).map((r) => (
            <li key={`${r.serviceId}-${r.sessionType}`} className="text-[12px] text-rose-800">
              <Link
                href={`/services/${r.serviceId}?tab=daily&sub=ratios`}
                className="underline-offset-2 hover:underline"
              >
                {r.serviceName}
              </Link>{" "}
              · <span className="capitalize">{r.sessionType}</span> · {r.ratioText}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="text-rose-700/70 hover:text-rose-900 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
