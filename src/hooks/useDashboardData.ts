"use client";

import { useQuery } from "@tanstack/react-query";

export interface CentreHealthItem {
  id: string;
  name: string;
  code: string;
  state: string | null;
  score: number;
  status: "green" | "amber" | "red";
  metrics: {
    occupancy: number;
    compliance: number;
    nps: number;
    margin: number;
  };
}

export interface TrendPoint {
  week: string;
  value: number;
}

export interface DashboardResponse {
  centreHealth: CentreHealthItem[];
  trends: {
    revenue: TrendPoint[];
    enrolments: TrendPoint[];
    tickets: TrendPoint[];
  };
  actionItems: {
    overdueTodos: { id: string; title: string; assigneeName: string; dueDate: string }[];
    unassignedTickets: { id: string; ticketNumber: number; subject: string }[];
    idsIssues: { id: string; title: string; priority: string }[];
    overdueRocks: { id: string; title: string; ownerName: string; quarter: string }[];
  };
  keyMetrics: {
    totalRevenue: number;
    avgOccupancy: number;
    overallNps: number;
    openTickets: number;
    activeCentres: number;
    rocksOnTrack: number;
    todosOverdue: number;
  };
}

export function useDashboardData() {
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard-command-centre"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    refetchInterval: 30000,
  });
}
