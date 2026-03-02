"use client";

import { useQuery } from "@tanstack/react-query";

export interface CentrePerformance {
  id: string;
  name: string;
  code: string;
  state: string | null;
  status: string;
  capacity: number | null;
  manager: { id: string; name: string } | null;
  score: number;
  metrics: {
    bscOccupancy: number;
    ascOccupancy: number;
    totalEducators: number;
    educatorsTurnover: number;
    ratioCompliance: number;
    parentNps: number | null;
    incidentCount: number;
    complaintCount: number;
    overallCompliance: number;
    nqsRating: string | null;
  } | null;
  financials: {
    totalRevenue: number;
    totalCosts: number;
    grossProfit: number;
    margin: number;
  } | null;
  openIssues: number;
  activeTodos: number;
  activeProjects: number;
}

export function usePerformance() {
  return useQuery<CentrePerformance[]>({
    queryKey: ["performance"],
    queryFn: async () => {
      const res = await fetch("/api/performance");
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
    refetchInterval: 60000,
  });
}
