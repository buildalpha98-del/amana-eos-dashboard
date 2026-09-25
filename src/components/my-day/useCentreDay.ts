"use client";

/**
 * useCentreDay — the "right now at the centre" query for /my-day
 * surfaces (Staff Portal v2 Phase 2).
 *
 * Same key + options as MyDayNowCard's inline query (`["centre-day",
 * serviceId]` against /api/services/[id]/dashboard), lifted into a hook
 * so the session snapshot strip and the roll-call callout share ONE
 * cache entry — the numbers on screen can never disagree with each
 * other or cost extra fetches.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { ServiceDashboardResponse } from "@/app/api/services/[id]/dashboard/route";

export function useCentreDay(serviceId: string) {
  return useQuery<ServiceDashboardResponse>({
    queryKey: ["centre-day", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/dashboard`),
    enabled: !!serviceId,
    refetchInterval: 60_000,
    retry: 2,
    staleTime: 30_000,
  });
}

/**
 * Booked children with no attendance action yet today — not signed in,
 * not signed out after attending, not marked absent. Per-programme so a
 * casual attendee in one session can't mask a missing child in another;
 * clamped at zero because casuals can attend beyond the booked set.
 */
export function countNotYetMarkedIn(data: ServiceDashboardResponse): number {
  return data.programmes.reduce(
    (acc, p) =>
      acc + Math.max(0, p.booked - p.inCare - p.wentHome - p.absent),
    0,
  );
}
