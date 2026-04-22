"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────

export interface MonthlyRollCallDay {
  date: string; // YYYY-MM-DD
  booked: number;
  attended: number;
  absent: number;
}

export interface MonthlyRollCallResponse {
  month: string; // "YYYY-MM"
  days: MonthlyRollCallDay[];
}

// ── Hook ─────────────────────────────────────────────────

/**
 * Fetch per-day booked/attended/absent counts for a month at a service.
 *
 * @param serviceId  UUID of the service
 * @param month      "YYYY-MM" (UTC-normalized; API validates)
 */
export function useMonthlyRollCall(serviceId: string, month: string) {
  return useQuery<MonthlyRollCallResponse>({
    queryKey: ["monthly-roll-call", serviceId, month],
    queryFn: () =>
      fetchApi<MonthlyRollCallResponse>(
        `/api/services/${serviceId}/roll-call/monthly?month=${month}`,
      ),
    enabled: !!serviceId && !!month,
    retry: 2,
    staleTime: 30_000,
  });
}
