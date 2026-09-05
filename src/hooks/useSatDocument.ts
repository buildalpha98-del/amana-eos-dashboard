"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

/**
 * Mutations for the element-level SAT/QIP document. The document itself rides
 * on the existing ["qip", serviceId] query (GET /api/qip?serviceId=), which
 * returns taxonomy-merged elements/legalChecks/improvements.
 */

export interface SatElement {
  code: string;
  standardCode: string;
  qualityArea: number;
  concept: string;
  description: string;
  evidence: string[];
  assessment: "not_assessed" | "met" | "not_met";
}

export interface SatLegalCheckRow {
  checkKey: string;
  qualityArea: number;
  lawRef: string;
  nqsRef: string;
  question: string;
  assessment: "not_assessed" | "compliant" | "non_compliant" | "not_applicable";
}

export interface SatImprovementRow {
  id: string;
  elementCode: string;
  issue: string;
  outcomeGoal: string;
  priority: "low" | "medium" | "high";
  steps: string;
  successMeasure: string;
  byWhen: string | null;
  progressNotes: string | null;
  status: "not_started" | "in_progress" | "completed";
  createdAt: string;
}

function useQipInvalidate(serviceId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["qip", serviceId] });
}

export function useUpdateElement(qipId: string, serviceId: string) {
  const invalidate = useQipInvalidate(serviceId);
  return useMutation<
    unknown,
    Error,
    { elementCode: string; evidence?: string[]; assessment?: string }
  >({
    mutationFn: ({ elementCode, ...body }) =>
      mutateApi(`/api/qip/${qipId}/elements/${elementCode}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Element saved" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save element",
      });
    },
  });
}

export function useUpdateLegalCheck(qipId: string, serviceId: string) {
  const invalidate = useQipInvalidate(serviceId);
  return useMutation<unknown, Error, { checkKey: string; assessment: string }>({
    mutationFn: ({ checkKey, assessment }) =>
      mutateApi(`/api/qip/${qipId}/legal/${checkKey}`, {
        method: "PATCH",
        body: { assessment },
      }),
    onSuccess: () => invalidate(),
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save checklist answer",
      });
    },
  });
}

export function useUpdateQipDocument(qipId: string, serviceId: string) {
  const invalidate = useQipInvalidate(serviceId);
  return useMutation<
    unknown,
    Error,
    { servicePhilosophy?: string; legalComments?: Record<string, string> }
  >({
    mutationFn: (body) => mutateApi(`/api/qip/${qipId}`, { method: "PATCH", body }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Saved" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save",
      });
    },
  });
}

export type ImprovementInput = Omit<SatImprovementRow, "id" | "createdAt" | "byWhen" | "progressNotes"> & {
  byWhen?: string;
  progressNotes?: string;
};

export function useImprovementMutations(qipId: string, serviceId: string) {
  const invalidate = useQipInvalidate(serviceId);
  const onError = (err: Error) => {
    toast({
      variant: "destructive",
      description: err.message || "Failed to save improvement",
    });
  };

  const create = useMutation<unknown, Error, ImprovementInput>({
    mutationFn: (body) =>
      mutateApi(`/api/qip/${qipId}/improvements`, { method: "POST", body }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Improvement added" });
    },
    onError,
  });

  const update = useMutation<
    unknown,
    Error,
    { improvementId: string } & Partial<ImprovementInput>
  >({
    mutationFn: ({ improvementId, ...body }) =>
      mutateApi(`/api/qip/${qipId}/improvements/${improvementId}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => invalidate(),
    onError,
  });

  const remove = useMutation<unknown, Error, { improvementId: string }>({
    mutationFn: ({ improvementId }) =>
      mutateApi(`/api/qip/${qipId}/improvements/${improvementId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Improvement removed" });
    },
    onError,
  });

  return { create, update, remove };
}
