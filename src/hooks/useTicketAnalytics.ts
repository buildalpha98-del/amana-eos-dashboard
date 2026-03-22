"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface TicketAnalyticsData {
  totalTickets: number;
  avgFirstResponseHours: number | null;
  avgResolutionHours: number | null;
  volumeTrend: Array<{ date: string; count: number }>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byCentre: Array<{ name: string; code: string; count: number }>;
  agentWorkload: Array<{
    id: string;
    name: string;
    ticketCount: number;
    avgResponseHours: number | null;
  }>;
}

export function useTicketAnalytics(days: number = 30, enabled: boolean = true) {
  return useQuery<TicketAnalyticsData>({
    queryKey: ["ticket-analytics", days],
    queryFn: () => fetchApi<TicketAnalyticsData>(`/api/tickets/analytics?days=${days}`),
    enabled,
    retry: 2,
    refetchInterval: 60000,
  });
}
