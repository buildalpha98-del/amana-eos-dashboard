"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────

export interface AuditTemplateSummary {
  id: string;
  name: string;
  qualityArea: number;
  nqsReference: string;
  frequency: string;
  scheduledMonths: number[];
  responseFormat: string;
  estimatedMinutes: number | null;
  isActive: boolean;
  sortOrder: number;
  _count: { items: number; instances: number };
}

export interface AuditInstanceSummary {
  id: string;
  templateId: string;
  serviceId: string;
  scheduledMonth: number;
  scheduledYear: number;
  dueDate: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  complianceScore: number | null;
  totalItems: number;
  yesCount: number;
  noCount: number;
  naCount: number;
  auditorName: string | null;
  template: {
    id: string;
    name: string;
    qualityArea: number;
    nqsReference: string;
    frequency: string;
    responseFormat: string;
  };
  service: { id: string; name: string; code: string };
  auditor: { id: string; name: string } | null;
}

export interface AuditItemResponseData {
  id: string;
  instanceId: string;
  templateItemId: string;
  result: string;
  ratingValue: number | null;
  actionRequired: string | null;
  evidenceSighted: string | null;
  notes: string | null;
  photoUrl: string | null;
  templateItem: {
    id: string;
    section: string | null;
    question: string;
    guidance: string | null;
    responseFormat: string | null;
    sortOrder: number;
    isRequired: boolean;
  };
}

export interface AuditInstanceDetail extends AuditInstanceSummary {
  strengths: string | null;
  areasForImprovement: string | null;
  actionPlan: string | null;
  comments: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  template: AuditInstanceSummary["template"] & {
    items: Array<{
      id: string;
      section: string | null;
      question: string;
      guidance: string | null;
      responseFormat: string | null;
      sortOrder: number;
      isRequired: boolean;
    }>;
  };
  responses: AuditItemResponseData[];
}

export interface AuditStats {
  scheduled: number;
  in_progress: number;
  completed: number;
  overdue: number;
  skipped: number;
  total: number;
  avgScore: number | null;
}

export interface QualificationRatioData {
  service: { id: string; name: string; code: string };
  totalStaff: number;
  certIIICount: number;
  diplomaCount: number;
  bachelorCount: number;
  diplomaPlusCount: number;
  certIIIPercent: number;
  diplomaPlusPercent: number;
  wwccCount: number;
  wwccPercent: number;
  firstAidCount: number;
  firstAidPercent: number;
  fiftyPercentCompliant: boolean;
}

// ── Templates ────────────────────────────────────────────

export function useAuditTemplates(filters?: { qualityArea?: number; frequency?: string }) {
  const params = new URLSearchParams();
  if (filters?.qualityArea) params.set("qualityArea", String(filters.qualityArea));
  if (filters?.frequency) params.set("frequency", filters.frequency);
  const query = params.toString();

  return useQuery<AuditTemplateSummary[]>({
    queryKey: ["audit-templates", filters],
    queryFn: async () => {
      const res = await fetch(`/api/audits/templates${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch audit templates");
      return res.json();
    },
  });
}

// ── Instances (list) ─────────────────────────────────────

export function useAuditInstances(filters?: {
  serviceId?: string;
  status?: string;
  qualityArea?: string;
  month?: number;
  year?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.qualityArea) params.set("qualityArea", filters.qualityArea);
  if (filters?.month) params.set("month", String(filters.month));
  if (filters?.year) params.set("year", String(filters.year));
  const query = params.toString();

  return useQuery<{
    instances: AuditInstanceSummary[];
    stats: AuditStats;
    pagination: { page: number; limit: number; total: number; pages: number };
  }>({
    queryKey: ["audit-instances", filters],
    queryFn: async () => {
      const res = await fetch(`/api/audits${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch audits");
      return res.json();
    },
  });
}

// ── Instance detail ──────────────────────────────────────

export function useAuditDetail(id: string) {
  return useQuery<AuditInstanceDetail>({
    queryKey: ["audit-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/audits/${id}`);
      if (!res.ok) throw new Error("Failed to fetch audit detail");
      return res.json();
    },
    enabled: !!id,
  });
}

// ── Mutations ────────────────────────────────────────────

export function useUpdateAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      action?: "start" | "complete" | "skip";
      strengths?: string;
      areasForImprovement?: string;
      actionPlan?: string;
      comments?: string;
    }) => {
      const res = await fetch(`/api/audits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update audit");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-instances"] });
      queryClient.invalidateQueries({ queryKey: ["audit-detail", vars.id] });
    },
  });
}

export function useSaveAuditResponses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      instanceId,
      responses,
    }: {
      instanceId: string;
      responses: Array<{
        id: string;
        result?: string;
        ratingValue?: number | null;
        actionRequired?: string | null;
        evidenceSighted?: string | null;
        notes?: string | null;
      }>;
    }) => {
      const res = await fetch(`/api/audits/${instanceId}/responses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save responses");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-detail", vars.instanceId] });
    },
  });
}

// ── Template Detail ─────────────────────────────────────

export interface AuditTemplateDetail extends AuditTemplateSummary {
  description: string | null;
  sourceFileName: string | null;
  items: Array<{
    id: string;
    section: string | null;
    question: string;
    guidance: string | null;
    responseFormat: string | null;
    sortOrder: number;
    isRequired: boolean;
  }>;
}

export function useAuditTemplateDetail(id: string) {
  return useQuery<AuditTemplateDetail>({
    queryKey: ["audit-template-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/audits/templates/${id}`);
      if (!res.ok) throw new Error("Failed to fetch template detail");
      return res.json();
    },
    enabled: !!id,
  });
}

// ── Template Mutations ──────────────────────────────────

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const res = await fetch(`/api/audits/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-templates"] });
      queryClient.invalidateQueries({ queryKey: ["audit-template-detail", vars.id] });
    },
  });
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, itemId }: { templateId: string; itemId: string }) => {
      const res = await fetch(`/api/audits/templates/${templateId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete item");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-template-detail", vars.templateId] });
    },
  });
}

export function useUpdateTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      itemId,
      ...data
    }: {
      templateId: string;
      itemId: string;
      [key: string]: unknown;
    }) => {
      const res = await fetch(`/api/audits/templates/${templateId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-template-detail", vars.templateId] });
    },
  });
}

export function useReorderTemplateItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, itemIds }: { templateId: string; itemIds: string[] }) => {
      const res = await fetch(`/api/audits/templates/${templateId}/items/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder items");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-template-detail", vars.templateId] });
    },
  });
}

// ── Parse & Import ──────────────────────────────────────

export interface ParsedItem {
  section: string | null;
  question: string;
  guidance: string | null;
  responseFormat: string;
}

export interface ParsedAuditResult {
  filename: string;
  detectedFormat: string;
  items: ParsedItem[];
  metadata: {
    totalItems: number;
    sections: string[];
    hasReverseYesNo: boolean;
  };
}

export function useParseAuditDocument() {
  return useMutation({
    mutationFn: async (file: File): Promise<ParsedAuditResult> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/audits/templates/parse", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to parse document");
      }
      return res.json();
    },
  });
}

export function useImportAuditItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      items,
      mode,
      sourceFileName,
    }: {
      templateId: string;
      items: ParsedItem[];
      mode: "replace" | "append";
      sourceFileName?: string;
    }) => {
      const res = await fetch(`/api/audits/templates/${templateId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, mode, sourceFileName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import items");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-templates"] });
      queryClient.invalidateQueries({ queryKey: ["audit-template-detail", vars.templateId] });
    },
  });
}

export interface BulkParseResult {
  results: Array<{
    filename: string;
    error: string | null;
    parsed: Omit<ParsedAuditResult, "filename"> | null;
    match: {
      filename: string;
      templateId: string | null;
      templateName: string | null;
      confidence: number;
    };
  }>;
}

export function useBulkParseAudit() {
  return useMutation({
    mutationFn: async (files: File[]): Promise<BulkParseResult> => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      const res = await fetch("/api/audits/templates/bulk-parse", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to bulk parse");
      }
      return res.json();
    },
  });
}

// ── Calendar Import ─────────────────────────────────────

export interface CalendarTemplatePreview {
  name: string;
  description: string;
  frequency: "monthly" | "half_yearly" | "yearly";
  qualityArea: number;
  nqsReference: string;
  scheduledMonths: number[];
}

export interface CalendarPreviewResult {
  preview: true;
  templates: CalendarTemplatePreview[];
  metadata: {
    totalTemplates: number;
    qualityAreas: number[];
  };
}

export interface CalendarImportResult {
  message: string;
  templatesCreated: number;
  templatesUpdated: number;
  totalTemplates: number;
  instancesCreated: number;
  instancesSkipped: number;
  templates: Array<{
    id: string;
    name: string;
    qualityArea: number;
    frequency: string;
    scheduledMonths: number[];
    isNew: boolean;
  }>;
}

export function usePreviewCalendar() {
  return useMutation({
    mutationFn: async (file: File): Promise<CalendarPreviewResult> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("preview", "true");
      const res = await fetch("/api/audits/calendar/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to preview calendar");
      }
      return res.json();
    },
  });
}

export function useImportCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      generateInstances,
      year,
    }: {
      file: File;
      generateInstances?: boolean;
      year?: number;
    }): Promise<CalendarImportResult> => {
      const formData = new FormData();
      formData.append("file", file);
      if (generateInstances) formData.append("generateInstances", "true");
      if (year) formData.append("year", String(year));
      const res = await fetch("/api/audits/calendar/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import calendar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-templates"] });
      queryClient.invalidateQueries({ queryKey: ["audit-instances"] });
    },
  });
}

// ── Qualification Ratios ─────────────────────────────────

export function useQualificationRatios() {
  return useQuery<{
    centres: QualificationRatioData[];
    network: {
      totalStaff: number;
      certIIICount: number;
      diplomaPlusCount: number;
      wwccCount: number;
      firstAidCount: number;
      compliantCentres: number;
      totalCentres: number;
      diplomaPlusPercent: number;
    };
  }>({
    queryKey: ["qualification-ratios"],
    queryFn: async () => {
      const res = await fetch("/api/compliance/qualification-ratios");
      if (!res.ok) throw new Error("Failed to fetch qualification ratios");
      return res.json();
    },
  });
}
