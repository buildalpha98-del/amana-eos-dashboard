"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface CentrePerformance {
  id: string;
  name: string;
  code: string;
  state: string | null;
  status: string;
  capacity: number | null;
  manager: { id: string; name: string } | null;
  score: number;
  trend: "improving" | "declining" | "stable";
  pillars: {
    financial: number;
    operational: number;
    compliance: number;
    satisfaction: number;
    teamCulture: number;
  };
  pillarBreakdowns: {
    financial: Record<string, number>;
    operational: Record<string, number>;
    compliance: Record<string, number>;
    satisfaction: Record<string, number>;
    teamCulture: Record<string, number>;
  };
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
    queryFn: () => fetchApi<CentrePerformance[]>("/api/performance"),
    retry: 2,
    refetchInterval: 60000,
  });
}
