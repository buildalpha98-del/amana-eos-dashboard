"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// ── Helpers ────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

// ── Templates ──────────────────────────────────────────────

export function useEmailTemplates(category?: string) {
  const params = category ? `?category=${category}` : "";
  return useQuery<EmailTemplateData[]>({
    queryKey: ["email-templates", category || "all"],
    queryFn: () => apiFetch(`/api/email-templates${params}`),
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery<EmailTemplateData>({
    queryKey: ["email-template", id],
    queryFn: () => apiFetch(`/api/email-templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailTemplateData>) =>
      apiFetch<EmailTemplateData>("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template created" });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EmailTemplateData>) =>
      apiFetch<EmailTemplateData>(`/api/email-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template updated" });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template deleted" });
    },
  });
}

export function useDuplicateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EmailTemplateData>(`/api/email-templates/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template duplicated" });
    },
  });
}

// ── Send / Preview ─────────────────────────────────────────

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      templateId: string;
      serviceIds?: string[];
      subject?: string;
      entityType?: string;
      entityId?: string;
    }) =>
      apiFetch<{ status: string; recipientCount: number }>(
        "/api/email/campaign/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["enquiry"] });
      toast({
        description: `Email ${result.status} to ${result.recipientCount} recipient(s)`,
      });
    },
  });
}

export function useEmailPreview() {
  return useMutation({
    mutationFn: (data: { templateId: string; variables?: Record<string, string> }) =>
      apiFetch<{ html: string }>("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
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
      apiFetch(
        `/api/email/history?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId!)}`,
      ),
    enabled: !!entityId,
  });
}
