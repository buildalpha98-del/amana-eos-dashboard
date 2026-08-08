"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
// Type-only import — audience-rules.ts only pulls zod + Prisma TYPES, so it
// is client-safe; the runtime prisma client never enters the bundle.
import type { AudienceRules } from "@/lib/audience-rules";
// Client-safe type-only import (email-marketing-layout.ts is a pure lib).
import type { EmailLayoutOptions } from "@/lib/email-marketing-layout";

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
    staleTime: 30_000,
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
    // Keep template data stable — prevents background refetches from handing
    // back a new object reference mid-typing in EmailComposer, which would
    // otherwise fire the reset effect and clobber the user's in-progress
    // edits. Mirrors the Bug #7 fix applied to `usePulses`.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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

// ── Audiences ──────────────────────────────────────────────

export interface EmailAudienceData {
  id: string;
  name: string;
  description: string | null;
  rules: AudienceRules;
  archived: boolean;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Detail response adds the live post-suppression recipient count. */
export interface EmailAudienceDetail extends EmailAudienceData {
  count: number;
}

export function useAudiences() {
  return useQuery<EmailAudienceData[]>({
    queryKey: ["email-audiences"],
    queryFn: () => fetchApi<EmailAudienceData[]>("/api/email/audiences"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useAudience(id: string | null) {
  return useQuery<EmailAudienceDetail>({
    queryKey: ["email-audiences", "detail", id],
    queryFn: () => fetchApi<EmailAudienceDetail>(`/api/email/audiences/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreateAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string | null;
      rules: AudienceRules;
    }) =>
      mutateApi<EmailAudienceData>("/api/email/audiences", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-audiences"] });
      toast({ description: "Audience created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string | null;
      rules?: AudienceRules;
    }) =>
      mutateApi<EmailAudienceData>(`/api/email/audiences/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-audiences"] });
      toast({ description: "Audience updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useArchiveAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ success: boolean }>(`/api/email/audiences/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-audiences"] });
      toast({ description: "Audience archived" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Live post-suppression count for DRAFT (unsaved) rules — powers the
 * AudienceManagerModal's debounced preview. */
export function usePreviewAudienceCount() {
  return useMutation({
    mutationFn: (rules: AudienceRules) =>
      mutateApi<{ count: number }>("/api/email/audiences/preview-count", {
        method: "POST",
        body: { rules },
      }),
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
      blocks?: unknown[] | null;
      serviceIds?: string[];
      allCentres?: boolean;
      audienceId?: string | null;
      scheduledAt?: string | null;
      enquiryId?: string | null;
      postId?: string | null;
      marketingCampaignId?: string | null;
      variables?: Record<string, string>;
      // Only present when the composer's Header & Footer panel is DIRTY —
      // omitted otherwise so the server's live org branding stays in charge.
      layoutOptions?: EmailLayoutOptions;
    }) =>
      mutateApi<{
        success: boolean;
        deliveryLogId: string;
        status: string;
        recipientCount: number;
        suppressedCount: number;
      }>(
        "/api/email/campaign/send",
        { method: "POST", body: data },
      ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["enquiry"] });
      qc.invalidateQueries({ queryKey: ["email-history"] });
      // Campaign detail panel lists linked email sends
      qc.invalidateQueries({ queryKey: ["campaign"] });
      toast({
        description: `Email ${result.status} to ${result.recipientCount} recipient(s)`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: (data: {
      subject: string;
      blocks?: unknown[] | null;
      htmlContent?: string | null;
      templateId?: string | null;
      layoutOptions?: EmailLayoutOptions;
    }) =>
      mutateApi<{ success: boolean; email: string; warning?: string }>(
        "/api/email/test-send",
        { method: "POST", body: data },
      ),
    onSuccess: (result) => {
      toast({
        description: result.warning
          ? `Test sent to ${result.email} — ${result.warning}`
          : `Test sent to ${result.email}`,
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
      layoutOptions?: EmailLayoutOptions;
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

// ── Per-send report ────────────────────────────────────────

export interface SendReportData {
  log: {
    id: string;
    subject: string | null;
    status: string;
    recipientCount: number;
    createdAt: string;
    messageType: string | null;
  };
  /** True while the send is still "scheduled" — shows the Cancel affordance. */
  canCancel: boolean;
  /** True for a partial send with failed recipients + stored HTML (resend input). */
  canResend: boolean;
  /** Set once a retry delivered — combine with canResend to hide the button. */
  resendDeliveryLogId: string | null;
  /** Count of failed recipients — derived server-side; raw emails never sent. */
  failedCount: number;
  /** False when the send has zero events — predates tracking or unopened. */
  hasEvents: boolean;
  stats: {
    delivered: number;
    uniqueOpens: number;
    uniqueClicks: number;
    bounced: number;
    /** Percentage (0–100) against post-suppression attempted recipients. */
    openRate: number;
    clickRate: number;
  };
  hourly: { hour: number; opens: number; clicks: number }[];
  /** Recipients whose FIRST click was this link (one clicked event per recipient). */
  topLinks: { link: string; clickers: number }[];
}

export function useSendReport(deliveryLogId: string | null) {
  return useQuery<SendReportData>({
    queryKey: ["send-report", deliveryLogId],
    queryFn: () =>
      fetchApi<SendReportData>(`/api/email/reports/${deliveryLogId}`),
    enabled: !!deliveryLogId,
    retry: 2,
    staleTime: 30_000,
  });
}

/**
 * Cancel a scheduled send: claims the local row, then best-effort-cancels on
 * Brevo. `brevoCancelled: false` means the row is cancelled locally but the
 * Brevo-side cancel didn't happen (legacy row or Brevo error) — surface the
 * server's `detail` so the user knows to check Brevo.
 */
export function useCancelScheduledSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryLogId: string) =>
      mutateApi<{
        cancelled: boolean;
        brevoCancelled: boolean;
        detail?: string;
      }>(`/api/email/scheduled/${deliveryLogId}/cancel`, { method: "POST" }),
    onSuccess: (result, deliveryLogId) => {
      qc.invalidateQueries({ queryKey: ["send-report", deliveryLogId] });
      qc.invalidateQueries({ queryKey: ["email-analytics"] });
      toast({
        description: result.brevoCancelled
          ? "Scheduled send cancelled"
          : `Send cancelled locally${result.detail ? ` — ${result.detail}` : ""}`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/**
 * Retry a PARTIAL send's failed recipients. The server re-dispatches the
 * stored rendering under a NEW DeliveryLog row; suppression is re-checked
 * but the frequency cap is not (it's a retry of an already-attempted send).
 */
export function useResendFailedRecipients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryLogId: string) =>
      mutateApi<{
        deliveryLogId: string;
        sentCount: number;
        failedCount: number;
        suppressedCount: number;
      }>(`/api/email/reports/${deliveryLogId}/resend`, { method: "POST" }),
    onSuccess: (result, deliveryLogId) => {
      qc.invalidateQueries({ queryKey: ["send-report", deliveryLogId] });
      qc.invalidateQueries({ queryKey: ["email-analytics"] });
      const extras = [
        result.failedCount > 0 ? `${result.failedCount} failed again` : null,
        result.suppressedCount > 0
          ? `${result.suppressedCount} skipped (suppressed)`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      toast({
        description:
          `Re-sent to ${result.sentCount} recipient(s)` +
          (extras ? ` — ${extras}` : ""),
      });
    },
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
    staleTime: 30_000,
    queryKey: ["email-history", entityType, entityId],
    queryFn: () =>
      fetchApi<EmailHistoryEntry[]>(
        `/api/email/history?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId!)}`,
      ),
    enabled: !!entityId,
    retry: 2,
  });
}
