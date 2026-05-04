"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ManualField } from "@/lib/contract-templates/manual-fields-schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ManualField };

export type ContractTemplateData = {
  id: string;
  name: string;
  description: string | null;
  contentJson: unknown; // TipTap doc
  manualFields: ManualField[];
  status: "active" | "disabled";
  createdById: string;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
  updatedBy?: { id: string; name: string };
};

export type PreviewResult = {
  html: string;
  missingTags: string[];
};

// ── List ──────────────────────────────────────────────────────────────────────

export function useContractTemplates(filters?: {
  status?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);

  const query = params.toString();

  return useQuery<ContractTemplateData[]>({
    queryKey: ["contract-templates", filters?.status ?? null, filters?.search ?? null],
    queryFn: () =>
      fetchApi<ContractTemplateData[]>(
        `/api/contract-templates${query ? `?${query}` : ""}`
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Single ────────────────────────────────────────────────────────────────────

export function useContractTemplate(id: string | null) {
  return useQuery<ContractTemplateData>({
    queryKey: ["contract-templates", id],
    queryFn: () => fetchApi<ContractTemplateData>(`/api/contract-templates/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string | null;
      contentJson: unknown;
      manualFields: ManualField[];
      status?: "active" | "disabled";
    }) => mutateApi<ContractTemplateData>("/api/contract-templates", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string | null;
      contentJson?: unknown;
      manualFields?: ManualField[];
      status?: "active" | "disabled";
    }) =>
      mutateApi<ContractTemplateData>(`/api/contract-templates/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
      qc.invalidateQueries({ queryKey: ["contract-templates", vars.id] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Clone ─────────────────────────────────────────────────────────────────────

export function useCloneContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<ContractTemplateData>(`/api/contract-templates/${id}/clone`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/contract-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates"] });
    },
    onError: (err: Error) => {
      const description = err.message?.includes("is referenced")
        ? "This template has been used to issue contracts. Disable it instead of deleting."
        : err.message || "Something went wrong";
      toast({ variant: "destructive", description });
    },
  });
}

// ── Preview ───────────────────────────────────────────────────────────────────

export function usePreviewContractTemplate() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, string> }) =>
      mutateApi<PreviewResult>(`/api/contract-templates/${id}/preview`, {
        method: "POST",
        body: data ?? {},
      }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Issue from template ───────────────────────────────────────────────────────

export function useIssueFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      templateId: string;
      userId: string;
      manualFieldValues?: Record<string, string>;
      startDate?: string;
    }) =>
      mutateApi<{ emailFailed?: boolean; [key: string]: unknown }>(
        "/api/contracts/issue-from-template",
        { method: "POST", body: data }
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      if (data.emailFailed === true) {
        toast({
          variant: "default",
          description:
            "Contract created but email to staff failed. Use the resend button.",
        });
      } else {
        toast({ description: "Contract issued and emailed." });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Resend issue email ────────────────────────────────────────────────────────

export function useResendIssueEmail() {
  return useMutation({
    mutationFn: (contractId: string) =>
      mutateApi(`/api/contracts/${contractId}/resend-issue-email`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({ description: "Email resent successfully." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
