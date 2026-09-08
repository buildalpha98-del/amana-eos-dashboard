"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { EmploymentType, AwardLevel, QualificationType, NewStarterRequestStatus } from "@prisma/client";

export interface NewStarterRequestItem {
  id: string;
  fullName: string;
  dateOfBirth: string;
  address: string;
  targetPosition: string;
  employmentType: EmploymentType;
  awardLevel: AwardLevel;
  awardLevelCustom: string | null;
  qualification: QualificationType | null;
  expectedStartDate: string;
  notes: string | null;
  status: NewStarterRequestStatus;
  requestedBy: { id: string; name: string; email: string; avatar: string | null };
  assignedAdmin: { id: string; name: string } | null;
  completedBy: { id: string; name: string } | null;
  completedUser: { id: string; name: string } | null;
  service: { id: string; name: string };
  createdAt: string;
}

export interface NewStarterRequestInput {
  fullName: string;
  dateOfBirth: string;
  address: string;
  targetPosition: string;
  employmentType: EmploymentType;
  awardLevel: AwardLevel;
  awardLevelCustom?: string;
  qualification?: QualificationType | null;
  serviceId: string;
  expectedStartDate: string;
  notes?: string;
}

export function useOnboardingRequests(status?: NewStarterRequestStatus) {
  return useQuery<{ requests: NewStarterRequestItem[] }>({
    queryKey: ["onboarding-requests", status ?? ""],
    queryFn: () =>
      fetchApi(`/api/onboarding-requests${status ? `?status=${status}` : ""}`),
    retry: 2,
  });
}

export function useCreateOnboardingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStarterRequestInput) =>
      mutateApi("/api/onboarding-requests", { method: "POST", body: input }),
    onSuccess: () => {
      toast({ description: "Onboarding request sent to admin." });
      qc.invalidateQueries({ queryKey: ["onboarding-requests"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useUpdateOnboardingRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { claim?: boolean; status?: "cancelled"; markCompleted?: boolean; completedUserId?: string | null }) =>
      mutateApi(`/api/onboarding-requests/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-requests"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}
