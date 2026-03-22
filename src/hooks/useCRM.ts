import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PipelineStage, LeadSource, TouchpointType } from "@prisma/client";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
  page?: number;
  limit?: number;
}

export interface PaginatedLeads {
  leads: LeadSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch leads (flat array). For paginated results, use `useLeadsPaginated`. */
export function useLeads(filters?: Omit<LeadFilters, "page" | "limit">) {
  return useQuery<LeadSummary[]>({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.stage) params.set("stage", filters.stage);
      if (filters?.source) params.set("source", filters.source);
      if (filters?.state) params.set("state", filters.state);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.search) params.set("search", filters.search);
      return fetchApi<LeadSummary[]>(`/api/crm/leads?${params}`);
    },
    retry: 2,
  });
}

/** Fetch leads with server-side pagination. */
export function useLeadsPaginated(filters?: LeadFilters) {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  return useQuery<PaginatedLeads>({
    queryKey: ["leads-paginated", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.stage) params.set("stage", filters.stage);
      if (filters?.source) params.set("source", filters.source);
      if (filters?.state) params.set("state", filters.state);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.search) params.set("search", filters.search);
      params.set("page", String(page));
      params.set("limit", String(limit));
      return fetchApi<PaginatedLeads>(`/api/crm/leads?${params}`);
    },
    retry: 2,
  });
}

export function useLead(id: string) {
  return useQuery<LeadDetail>({
    queryKey: ["lead", id],
    queryFn: async () => {
      return fetchApi<LeadDetail>(`/api/crm/leads/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useTouchpoints(leadId: string) {
  return useQuery<TouchpointEntry[]>({
    queryKey: ["touchpoints", leadId],
    queryFn: async () => {
      return fetchApi<TouchpointEntry[]>(`/api/crm/leads/${leadId}/touchpoints`);
    },
    enabled: !!leadId,
    retry: 2,
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
      return mutateApi("/api/crm/leads", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi(`/api/crm/leads/${id}`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.id] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/crm/leads/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi(`/api/crm/leads/${leadId}/touchpoints`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi(`/api/crm/leads/${leadId}/send-email`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi<LeadScoreResult>(`/api/crm/leads/${leadId}/score`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", data.id] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
