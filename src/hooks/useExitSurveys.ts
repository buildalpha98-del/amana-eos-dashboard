"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────────

export interface ReasonDistribution {
  reason: string;
  count: number;
  percentage: number;
}

export interface RecentComment {
  date: string;
  reason: string;
  comment: string;
}

export interface ServiceSurveyData {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  totalExits: number;
  averageSatisfaction: number;
  wouldReturnRate: number;
  reasonDistribution: ReasonDistribution[];
  recentComments: RecentComment[];
}

export interface ChurnData {
  withdrawnCount: number;
  activeCount: number;
  churnRate: number;
  period: string;
}

export interface ExitSurveySummary {
  services: ServiceSurveyData[];
  churn: ChurnData;
}

export interface TriggerSurveyPayload {
  serviceId: string;
  contactId?: string;
  childName: string;
  withdrawalDate?: string;
  contactEmail?: string;
}

export interface TriggerSurveyResponse {
  id: string;
  surveyUrl: string;
  surveyToken: string;
  expiresAt: string;
}

// ── Hooks ──────────────────────────────────────────────────────

export function useExitSurveySummary(filters?: { serviceId?: string; months?: number }) {
  return useQuery<ExitSurveySummary>({
    queryKey: ["exit-survey-summary", filters?.serviceId, filters?.months],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.months) params.set("months", String(filters.months));
      return fetchApi<ExitSurveySummary>(`/api/exit-survey/summary?${params}`);
    },
    retry: 2,
  });
}

export function useTriggerExitSurvey() {
  const qc = useQueryClient();
  return useMutation<TriggerSurveyResponse, Error, TriggerSurveyPayload>({
    mutationFn: async (data) => {
      return mutateApi<TriggerSurveyResponse>("/api/exit-survey/trigger", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exit-survey-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
