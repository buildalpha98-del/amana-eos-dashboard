"use client";

import { useQuery } from "@tanstack/react-query";

export interface CentreHealthItem {
  id: string;
  name: string;
  code: string;
  state: string | null;
  score: number;
  status: "green" | "amber" | "red";
  trend: "improving" | "declining" | "stable";
  pillars: {
    financial: number;
    operational: number;
    compliance: number;
    satisfaction: number;
    teamCulture: number;
  };
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

export interface TodaysOpsItem {
  id: string;
  name: string;
  code: string;
  bscAttended: number;
  bscEnrolled: number;
  ascAttended: number;
  ascEnrolled: number;
  educatorsRostered: number;
  ratioOk: boolean;
  incidentsToday: number;
  opsStatus: "green" | "amber" | "red";
}

export interface OpsMetrics {
  todayAttended: number;
  todayExpected: number;
  staffingAlerts: number;
  complianceScore: number;
  weeklyRevenue: number;
  pipelineLeads: number;
  enrolmentPipeline: { stage: string; count: number }[];
}

export interface DashboardResponse {
  centreHealth: CentreHealthItem[];
  networkAvgScore: number;
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
  projectTodos: ProjectTodoItem[];
  todaysOps: TodaysOpsItem[];
  opsMetrics: OpsMetrics | null;
}

export interface ProjectTodoItem {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  assigneeName: string;
  assigneeId: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  serviceName: string | null;
  serviceCode: string | null;
  serviceId: string | null;
  isOverdue: boolean;
}

export function useDashboardData(period?: string) {
  const params = period ? `?period=${encodeURIComponent(period)}` : "";
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard-command-centre", period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard${params}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

// ─── Per-Widget Selector Hooks ────────────────────────────────
// Each hook selects a slice of the dashboard response.
// React Query deduplicates: all hooks share one network request.

function useDashboardSlice<T>(
  period: string | undefined,
  selector: (data: DashboardResponse) => T
) {
  const params = period ? `?period=${encodeURIComponent(period)}` : "";
  return useQuery<DashboardResponse, Error, T>({
    queryKey: ["dashboard-command-centre", period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard${params}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    refetchInterval: 30000,
    select: selector,
  });
}

export function useCentreHealth(period?: string) {
  return useDashboardSlice(period, (d) => ({
    centreHealth: d.centreHealth,
    networkAvgScore: d.networkAvgScore,
  }));
}

export function useKeyMetrics(period?: string) {
  return useDashboardSlice(period, (d) => ({
    keyMetrics: d.keyMetrics,
    opsMetrics: d.opsMetrics,
  }));
}

export function useTrendSparklines(period?: string) {
  return useDashboardSlice(period, (d) => d.trends);
}

export function useActionItems(period?: string) {
  return useDashboardSlice(period, (d) => d.actionItems);
}

export function useProjectTodos(period?: string) {
  return useDashboardSlice(period, (d) => d.projectTodos);
}

export function useTodaysOps(period?: string) {
  return useDashboardSlice(period, (d) => d.todaysOps);
}
