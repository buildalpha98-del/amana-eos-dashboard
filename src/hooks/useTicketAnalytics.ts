"use client";

import { useQuery } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch(`/api/tickets/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch ticket analytics");
      return res.json();
    },
    enabled,
    refetchInterval: 60000,
  });
}
