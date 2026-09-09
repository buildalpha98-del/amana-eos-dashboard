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
  mobile: string;
  email: string;
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
  completedUser: { id: string; name: string; email: string } | null;
  service: { id: string; name: string };
  createdAt: string;
}

export interface NewStarterRequestInput {
  fullName: string;
  dateOfBirth: string;
  address: string;
  mobile: string;
  email: string;
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
    onSuccess: (_data, input) => {
      toast({
        description: `${input.fullName}'s account is set up — their dashboard invite is on the way.`,
      });
      qc.invalidateQueries({ queryKey: ["onboarding-requests"] });
      qc.invalidateQueries({ queryKey: ["employees-list"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}
