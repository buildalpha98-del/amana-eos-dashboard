"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncidentFilters {
  serviceId?: string;
  type?: string;
  severity?: string;
  from?: string;
  to?: string;
}

export interface IncidentRecord {
  id: string;
  serviceId: string;
  incidentDate: string;
  childName: string | null;
  incidentType: string;
  severity: string;
  location: string | null;
  timeOfDay: string | null;
  description: string;
  actionTaken: string | null;
  parentNotified: boolean;
  reportableToAuthority: boolean;
  reportedToAuthorityAt: string | null;
  followUpRequired: boolean;
  followUpCompleted: boolean;
  createdAt: string;
  service: { id: string; name: string; code: string };
  createdBy: { id: string; name: string } | null;
}

export interface IncidentListResponse {
  incidents: IncidentRecord[];
  count: number;
}

export interface IncidentSummary {
  total: number;
  reportable: number;
  followUpPending: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byCentre: Record<string, number>;
  byLocation: Record<string, number>;
}

export interface WeekOnWeek {
  currentWeek: string | null;
  currentCount: number;
  previousWeek: string | null;
  previousCount: number;
  change: number;
  trend: "rising" | "falling" | "stable" | "insufficient_data";
}

export interface FlaggedCentre {
  centre: string;
  reason: string;
  count: number;
  average: number;
}

export interface IncidentTrends {
  totalIncidents: number;
  period: { from: string; weeks: number };
  weekOnWeek: WeekOnWeek;
  weeklyTrend: { week: string; total: number }[];
  rollingAverages: Record<string, { total: number; weeks: number; average: number }>;
  flaggedCentres: FlaggedCentre[];
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byLocation: Record<string, number>;
  byTimeOfDay: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(filters?: IncidentFilters, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  return params.toString();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** List incidents with filters */
export function useIncidents(filters?: IncidentFilters) {
  return useQuery<IncidentListResponse>({
    queryKey: ["incidents", filters],
    queryFn: () => {
      const qs = buildParams(filters);
      return fetchApi<IncidentListResponse>(`/api/incidents${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

/** Summary aggregates (total, reportable, follow-up pending, distributions) */
export function useIncidentSummary(filters?: IncidentFilters) {
  return useQuery<IncidentSummary>({
    queryKey: ["incidents-summary", filters],
    queryFn: () => {
      const qs = buildParams(filters, { summary: "true" });
      return fetchApi<IncidentSummary>(`/api/incidents?${qs}`);
    },
    retry: 2,
  });
}

/** Weekly trend analysis */
export function useIncidentTrends(weeks?: number) {
  return useQuery<IncidentTrends>({
    queryKey: ["incidents-trends", weeks],
    queryFn: () => {
      const params = new URLSearchParams();
      if (weeks) params.set("weeks", String(weeks));
      const qs = params.toString();
      return fetchApi<IncidentTrends>(`/api/incidents/trends${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });
}

/** Create a new incident */
export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      serviceId: string;
      incidentDate: string;
      childName?: string;
      incidentType: string;
      severity: string;
      location?: string;
      timeOfDay?: string;
      description: string;
      actionTaken?: string;
      parentNotified?: boolean;
      reportableToAuthority?: boolean;
      followUpRequired?: boolean;
    }) => {
      return mutateApi("/api/incidents", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      queryClient.invalidateQueries({ queryKey: ["incidents-trends"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
