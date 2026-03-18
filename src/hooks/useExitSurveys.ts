"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.months) params.set("months", String(filters.months));
      const res = await fetch(`/api/exit-survey/summary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch exit survey summary");
      return res.json();
    },
  });
}

export function useTriggerExitSurvey() {
  const qc = useQueryClient();
  return useMutation<TriggerSurveyResponse, Error, TriggerSurveyPayload>({
    mutationFn: async (data) => {
      const res = await fetch("/api/exit-survey/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to trigger exit survey");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exit-survey-summary"] });
    },
  });
}
