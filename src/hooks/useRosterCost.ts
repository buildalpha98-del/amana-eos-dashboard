"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { CostProjection } from "@/lib/roster-cost";

/**
 * Wage-cost projection for the visible week of a service's roster.
 * Companion to `RosterCostBadge` — shows the total wage spend and
 * any unpriced hours (shifts where the user has no active contract).
 */
export function useRosterCost(
  serviceId: string | undefined,
  weekStart: string | undefined,
  /** Only people who run the roster may see wages (2026-10-09). */
  allowed = true,
) {
  return useQuery<CostProjection>({
    queryKey: ["roster-cost", serviceId, weekStart],
    queryFn: () =>
      fetchApi<CostProjection>(
        `/api/roster/cost-projection?serviceId=${encodeURIComponent(serviceId!)}&weekStart=${encodeURIComponent(weekStart!)}`,
      ),
    enabled: allowed && !!serviceId && !!weekStart,
    retry: 2,
    staleTime: 60_000,
  });
}
