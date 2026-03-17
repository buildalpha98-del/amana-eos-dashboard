import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PipelineStage, LeadSource, TouchpointType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadSummary {
  id: string;
  schoolName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  source: LeadSource;
  pipelineStage: PipelineStage;
  tenderRef: string | null;
  tenderCloseDate: string | null;
  tenderUrl: string | null;
  estimatedCapacity: number | null;
  notes: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string; avatar: string | null } | null;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  stageChangedAt: string;
  nextTouchpointAt: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  aiScore: number | null;
  aiScoreSummary: string | null;
  aiScoredAt: string | null;
  _count: { touchpoints: number };
}

export interface TouchpointEntry {
  id: string;
  leadId: string;
  type: TouchpointType;
  subject: string | null;
  body: string | null;
  sentAt: string;
  sentById: string | null;
  sentBy: { id: string; name: string; avatar: string | null } | null;
}

export interface LeadDetail extends LeadSummary {
  touchpoints: TouchpointEntry[];
}

export interface LeadFilters {
  stage?: string;
  source?: string;
  state?: string;
  assigneeId?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useLeads(filters?: LeadFilters) {
  return useQuery<LeadSummary[]>({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.stage) params.set("stage", filters.stage);
      if (filters?.source) params.set("source", filters.source);
      if (filters?.state) params.set("state", filters.state);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.search) params.set("search", filters.search);
      const res = await fetch(`/api/crm/leads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });
}

export function useLead(id: string) {
  return useQuery<LeadDetail>({
    queryKey: ["lead", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/leads/${id}`);
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useTouchpoints(leadId: string) {
  return useQuery<TouchpointEntry[]>({
    queryKey: ["touchpoints", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/leads/${leadId}/touchpoints`);
      if (!res.ok) throw new Error("Failed to fetch touchpoints");
      return res.json();
    },
    enabled: !!leadId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      schoolName: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      source?: string;
      tenderRef?: string;
      tenderCloseDate?: string;
      tenderUrl?: string;
      estimatedCapacity?: number;
      notes?: string;
      assignedToId?: string;
    }) => {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create lead");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      [key: string]: unknown;
    }) => {
      const res = await fetch(`/api/crm/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update lead");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.id] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useCreateTouchpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      ...data
    }: {
      leadId: string;
      type: string;
      subject?: string;
      body?: string;
    }) => {
      const res = await fetch(`/api/crm/leads/${leadId}/touchpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create touchpoint");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

export function useSendLeadEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      ...data
    }: {
      leadId: string;
      subject: string;
      body: string;
      templateId?: string;
    }) => {
      const res = await fetch(`/api/crm/leads/${leadId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send email");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

// ---------------------------------------------------------------------------
// AI Lead Scoring
// ---------------------------------------------------------------------------

export interface LeadScoreResult extends LeadSummary {
  aiScoreFactors?: string[];
}

export function useScoreLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string): Promise<LeadScoreResult> => {
      const res = await fetch(`/api/crm/leads/${leadId}/score`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to score lead");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", data.id] });
    },
  });
}
