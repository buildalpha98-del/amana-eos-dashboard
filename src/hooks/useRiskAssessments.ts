"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface Hazard {
  hazard: string;
  likelihood: number;
  severity: number;
  controls: string;
}

export interface RiskAssessmentItem {
  id: string;
  serviceId: string;
  authorId: string;
  title: string;
  activityType: "routine" | "incursion" | "excursion" | "special";
  date: string;
  location: string | null;
  hazards: Hazard[];
  approvedById: string | null;
  approvedAt: string | null;
  attachmentUrls: string[];
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatar: string | null };
  approvedBy: { id: string; name: string; avatar: string | null } | null;
}

export function useRiskAssessments(
  serviceId: string | undefined,
  filters?: { activityType?: string; status?: "pending" | "approved" },
) {
  const qs = new URLSearchParams();
  if (filters?.activityType) qs.set("activityType", filters.activityType);
  if (filters?.status) qs.set("status", filters.status);
  return useQuery<{ items: RiskAssessmentItem[] }>({
    queryKey: [
      "risk-assessments",
      serviceId,
      filters?.activityType,
      filters?.status,
    ],
    queryFn: () =>
      fetchApi<{ items: RiskAssessmentItem[] }>(
        `/api/services/${serviceId}/risk-assessments?${qs.toString()}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateRiskAssessmentArgs {
  title: string;
  activityType: RiskAssessmentItem["activityType"];
  date: string;
  location?: string;
  hazards: Hazard[];
  attachmentUrls?: string[];
}

export function useCreateRiskAssessment(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, CreateRiskAssessmentArgs>({
    mutationFn: (body) =>
      mutateApi<RiskAssessmentItem>(
        `/api/services/${serviceId}/risk-assessments`,
        { method: "POST", body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-assessments", serviceId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save risk assessment",
      });
    },
  });
}

export function useApproveRiskAssessment(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, { raId: string }>({
    mutationFn: ({ raId }) =>
      mutateApi<RiskAssessmentItem>(
        `/api/services/${serviceId}/risk-assessments/${raId}/approve`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-assessments", serviceId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to approve risk assessment",
      });
    },
  });
}
