"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface SpendingBreakdownRow {
  service: { id: string; code: string; name: string; state: string | null };
  weekBookings: number;
  perSession: { bsc: number; asc: number; vc: number };
  groceryForecast: number;
  grocerySpend: number;
  groceryVariance: number;
  monthlyAllocation: number;
  monthlyAllocationSource: "override" | "tier";
  monthlyPurchaseSpend: number;
  monthlyRemaining: number;
}

export interface SpendingBreakdown {
  weekStart: string;
  weekEnd: string;
  monthStart: string;
  rows: SpendingBreakdownRow[];
}

export function useSpendingBreakdown(params: { week?: string } = {}) {
  return useQuery<SpendingBreakdown>({
    queryKey: ["financials-spending-breakdown", params.week],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params.week) sp.set("week", params.week);
      return fetchApi<SpendingBreakdown>(
        `/api/financials/spending-breakdown${sp.toString() ? `?${sp}` : ""}`,
      );
    },
    retry: 2,
    staleTime: 60_000,
  });
}
