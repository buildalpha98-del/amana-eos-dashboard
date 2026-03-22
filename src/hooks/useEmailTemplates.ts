"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────

export interface EmailTemplateData {
  id: string;
  name: string;
  category: "welcome" | "newsletter" | "event" | "announcement" | "custom";
  subject: string;
  htmlContent: string | null;
  blocks: unknown[] | null;
  isDefault: boolean;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Templates ──────────────────────────────────────────────

export function useEmailTemplates(category?: string) {
  const params = category ? `?category=${category}` : "";
  return useQuery<EmailTemplateData[]>({
    queryKey: ["email-templates", category || "all"],
    queryFn: () => fetchApi<EmailTemplateData[]>(`/api/email-templates${params}`),
    retry: 2,
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery<EmailTemplateData>({
    queryKey: ["email-template", id],
    queryFn: () => fetchApi<EmailTemplateData>(`/api/email-templates/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailTemplateData>) =>
      mutateApi<EmailTemplateData>("/api/email-templates", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EmailTemplateData>) =>
      mutateApi<EmailTemplateData>(`/api/email-templates/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDuplicateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<EmailTemplateData>(`/api/email-templates/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template duplicated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Send / Preview ─────────────────────────────────────────

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      templateId?: string | null;
      subject: string;
      htmlContent?: string | null;
      serviceIds?: string[];
      enquiryId?: string | null;
      postId?: string | null;
      variables?: Record<string, string>;
    }) =>
      mutateApi<{ status: string; recipientCount: number }>(
        "/api/email/campaign/send",
        { method: "POST", body: data },
      ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["enquiry"] });
      qc.invalidateQueries({ queryKey: ["email-history"] });
      toast({
        description: `Email ${result.status} to ${result.recipientCount} recipient(s)`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useEmailPreview() {
  return useMutation({
    mutationFn: (data: {
      templateId?: string | null;
      htmlContent?: string | null;
      variables?: Record<string, string>;
    }) =>
      mutateApi<{ html: string }>("/api/email/preview", {
        method: "POST",
        body: data,
      }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── History ────────────────────────────────────────────────

export interface EmailHistoryEntry {
  id: string;
  subject: string | null;
  status: string;
  recipientCount: number;
  createdAt: string;
}

export function useEmailHistory(entityType: string, entityId: string | null) {
  return useQuery<EmailHistoryEntry[]>({
    queryKey: ["email-history", entityType, entityId],
    queryFn: () =>
      fetchApi<EmailHistoryEntry[]>(
        `/api/email/history?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId!)}`,
      ),
    enabled: !!entityId,
    retry: 2,
  });
}
