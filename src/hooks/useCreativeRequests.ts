"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  CreativeRequestStatus,
  CreativeRequestType,
  ProofDecision,
  TicketPriority,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Types — mirror the route response shapes
// ---------------------------------------------------------------------------

export interface RequestAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  messageId: string | null;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface RequestProof {
  id: string;
  version: number;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  note: string | null;
  decision: ProofDecision | null;
  decisionNote: string | null;
  decidedAt: string | null;
  uploadedBy: { id: string; name: string | null } | null;
  decidedBy: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface CreativeRequestItem {
  id: string;
  requestNumber: string;
  title: string;
  type: CreativeRequestType;
  status: CreativeRequestStatus;
  priority: TicketPriority;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  requestedById: string;
  requestedBy: { id: string; name: string | null } | null;
  assigneeId: string | null;
  assignee: { id: string; name: string | null } | null;
  purpose: string;
  exactCopy: string | null;
  sizeSpec: string | null;
  outputFormat: string | null;
  dueDate: string;
  briefedAt: string | null;
  inProgressAt: string | null;
  inReviewAt: string | null;
  changesRequestedAt: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  checklist: ChecklistItem[] | null;
  pausedAt: string | null;
  pausedMs: number;
  createdAt: string;
  updatedAt: string;
  attachments: RequestAttachment[];
}

export interface RequestMessage {
  id: string;
  authorId: string;
  author: { id: string; name: string | null } | null;
  body: string;
  internal: boolean;
  createdAt: string;
  attachments: RequestAttachment[];
}

export interface AttachmentInput {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

export interface CreateRequestInput {
  title: string;
  type: CreativeRequestType;
  purpose: string;
  exactCopy?: string;
  sizeSpec?: string;
  outputFormat?: string;
  serviceId?: string | null;
  priority?: TicketPriority;
  dueDate?: string;
  attachments?: AttachmentInput[];
}

export interface PatchRequestInput {
  status?: CreativeRequestStatus;
  assigneeId?: string | null;
  priority?: TicketPriority;
  dueDate?: string;
  cancellationReason?: string;
  checklist?: ChecklistItem[];
}

const onError = (err: Error) => {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
};

// ---------------------------------------------------------------------------
// Queries — primitive-only query keys
// ---------------------------------------------------------------------------

export function useCreativeRequests(filters?: {
  status?: CreativeRequestStatus;
  serviceId?: string;
  assigneeId?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: [
      "creative-requests",
      filters?.status ?? null,
      filters?.serviceId ?? null,
      filters?.assigneeId ?? null,
      filters?.search ?? null,
    ],
    queryFn: () =>
      fetchApi<{ requests: CreativeRequestItem[] }>(
        `/api/creative-requests${qs ? `?${qs}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreativeRequest(id: string | null) {
  return useQuery({
    queryKey: ["creative-request", id],
    queryFn: () =>
      fetchApi<{ request: CreativeRequestItem }>(`/api/creative-requests/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRequestMessages(id: string | null) {
  return useQuery({
    queryKey: ["creative-request-messages", id],
    queryFn: () =>
      fetchApi<{ messages: RequestMessage[] }>(
        `/api/creative-requests/${id}/messages`,
      ),
    enabled: !!id,
    retry: 2,
    staleTime: 15_000,
  });
}

export function useRequestProofs(id: string | null) {
  return useQuery({
    queryKey: ["creative-request-proofs", id],
    queryFn: () =>
      fetchApi<{ proofs: RequestProof[] }>(`/api/creative-requests/${id}/proofs`),
    enabled: !!id,
    retry: 2,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations — all with destructive-toast onError
// ---------------------------------------------------------------------------

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) =>
      mutateApi<{ request: CreativeRequestItem }>("/api/creative-requests", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
      toast({ description: "Request submitted — the marketing team has been notified" });
    },
    onError,
  });
}

export function usePatchRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PatchRequestInput & { id: string }) =>
      mutateApi<{ request: CreativeRequestItem }>(`/api/creative-requests/${id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
      qc.invalidateQueries({ queryKey: ["creative-request", vars.id] });
    },
    onError,
  });
}

export function usePostRequestMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      body: string;
      internal?: boolean;
      attachments?: AttachmentInput[];
    }) =>
      mutateApi<{ message: RequestMessage }>(`/api/creative-requests/${id}/messages`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-request-messages", vars.id] });
    },
    onError,
  });
}

export function useUploadProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: AttachmentInput & { id: string; note?: string }) =>
      mutateApi<{ proof: RequestProof }>(`/api/creative-requests/${id}/proofs`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-request-proofs", vars.id] });
      qc.invalidateQueries({ queryKey: ["creative-request", vars.id] });
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
      toast({ description: "Proof sent for review — the requester has been notified" });
    },
    onError,
  });
}

export function useDecideProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      proofId,
      ...input
    }: {
      id: string;
      proofId: string;
      decision: ProofDecision;
      note?: string;
    }) =>
      mutateApi<{ proof: RequestProof; request: CreativeRequestItem }>(
        `/api/creative-requests/${id}/proofs/${proofId}/decision`,
        { method: "POST", body: input },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["creative-request-proofs", vars.id] });
      qc.invalidateQueries({ queryKey: ["creative-request", vars.id] });
      qc.invalidateQueries({ queryKey: ["creative-requests"] });
    },
    onError,
  });
}
