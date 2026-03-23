"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationTask {
  taskKey: string;
  seat: string;
  reportType: string;
  lastRunAt: string | null;
  lastStatus: "success" | "failed";
  runCount: number;
  health: "green" | "amber" | "red" | "never_run";
  expectedIntervalHours: number;
  lastTitle: string | null;
  lastMetrics: unknown;
}

export interface AutomationSeat {
  seat: string;
  label: string;
  taskCount: number;
  green: number;
  amber: number;
  red: number;
  neverRun: number;
  tasks: AutomationTask[];
}

export interface AutomationStatusResponse {
  summary: {
    total: number;
    green: number;
    amber: number;
    red: number;
    neverRun: number;
  };
  seats: AutomationSeat[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAutomationStatus(timeRange = "7d") {
  return useQuery<AutomationStatusResponse>({
    queryKey: ["automation-status", timeRange],
    queryFn: () =>
      fetchApi<AutomationStatusResponse>(
        `/api/automations/status?timeRange=${timeRange}`,
      ),
    staleTime: 60_000,
    retry: 2,
    refetchInterval: 60_000,
  });
}
