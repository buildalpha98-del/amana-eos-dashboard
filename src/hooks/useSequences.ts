"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SequenceStepData {
  id: string;
  sequenceId: string;
  stepNumber: number;
  name: string;
  delayHours: number;
  templateKey: string;
  emailTemplateId: string | null;
  emailTemplate?: { id: string; name: string; subject: string } | null;
}

export interface SequenceData {
  id: string;
  name: string;
  type: string;
  triggerStage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  steps: SequenceStepData[];
  _count?: { enrolments: number };
  enrolmentStats?: {
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
  };
}

export interface SequenceEnrolmentData {
  id: string;
  sequenceId: string;
  contactId: string | null;
  leadId: string | null;
  status: string;
  currentStepNumber: number;
  anchorDate: string;
  enrolledAt: string;
  sequence: { id: string; name: string; type: string };
  contact?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  lead?: {
    id: string;
    schoolName: string;
    contactName: string | null;
  } | null;
  executions: Array<{
    id: string;
    stepId: string;
    scheduledFor: string;
    status: string;
    sentAt: string | null;
  }>;
}

interface SequencesResponse {
  sequences: SequenceData[];
}

interface EnrolmentsResponse {
  enrolments: SequenceEnrolmentData[];
  total: number;
}

// ---------------------------------------------------------------------------
// Sequence hooks
// ---------------------------------------------------------------------------

export function useSequences(type?: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);

  return useQuery<SequencesResponse>({
    queryKey: ["sequences", type || "all"],
    queryFn: async () => {
      return fetchApi<SequencesResponse>(`/api/sequences?${params}`);
    },
    retry: 2,
  });
}

export function useSequence(id: string | null) {
  return useQuery<SequenceData>({
    queryKey: ["sequence", id],
    queryFn: async () => {
      return fetchApi<SequenceData>(`/api/sequences/${id}`);
    },
    enabled: Boolean(id),
    retry: 2,
  });
}

export function useCreateSequence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      type: string;
      triggerStage?: string;
      steps: Array<{
        name: string;
        delayHours: number;
        templateKey: string;
        emailTemplateId?: string;
      }>;
    }) => {
      return mutateApi("/api/sequences", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast({ description: "Sequence created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateSequence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      triggerStage?: string | null;
      isActive?: boolean;
      steps?: Array<{
        name: string;
        delayHours: number;
        templateKey: string;
        emailTemplateId?: string;
      }>;
    }) => {
      return mutateApi(`/api/sequences/${id}`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      queryClient.invalidateQueries({ queryKey: ["sequence", vars.id] });
      toast({ description: "Sequence updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteSequence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/sequences/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast({ description: "Sequence deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ---------------------------------------------------------------------------
// Enrolment hooks
// ---------------------------------------------------------------------------

export function useSequenceEnrolments(filters?: {
  type?: string;
  status?: string;
  sequenceId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.sequenceId) params.set("sequenceId", filters.sequenceId);
  params.set("limit", "100");

  return useQuery<EnrolmentsResponse>({
    queryKey: [
      "sequence-enrolments",
      filters?.type || "all",
      filters?.status || "all",
      filters?.sequenceId || "",
    ],
    queryFn: async () => {
      return fetchApi<EnrolmentsResponse>(`/api/sequences/enrolments?${params}`);
    },
    retry: 2,
  });
}

function useEnrolmentAction(action: "pause" | "resume" | "cancel") {
  const queryClient = useQueryClient();
  const labels: Record<string, string> = {
    pause: "Enrolment paused",
    resume: "Enrolment resumed",
    cancel: "Enrolment cancelled",
  };

  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/sequences/enrolments/${id}`, {
        method: "POST",
        body: { action },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence-enrolments"] });
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast({ description: labels[action] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function usePauseEnrolment() {
  return useEnrolmentAction("pause");
}

export function useResumeEnrolment() {
  return useEnrolmentAction("resume");
}

export function useCancelEnrolment() {
  return useEnrolmentAction("cancel");
}
