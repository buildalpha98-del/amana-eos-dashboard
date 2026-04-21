"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { PolicyStatus } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolicyData {
  id: string;
  title: string;
  description: string | null;
  version: number;
  status: PolicyStatus;
  category: string | null;
  documentUrl: string | null;
  documentId: string | null;
  publishedAt: string | null;
  requiresReack: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { acknowledgements: number };
}

export interface PolicyAckUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface PolicyAck {
  id: string;
  userId: string;
  policyVersion: number;
  acknowledgedAt: string;
  user: PolicyAckUser;
}

export interface PolicyDetail extends Omit<PolicyData, "_count"> {
  acknowledgements: PolicyAck[];
  stats: {
    totalStaff: number;
    acknowledgedCount: number;
    pendingCount: number;
  };
}

export interface PolicyCompliance {
  id: string;
  title: string;
  version: number;
  category: string | null;
  publishedAt: string | null;
  totalStaff: number;
  acknowledgedCount: number;
  pendingCount: number;
  complianceRate: number;
}

// ── Policies List ────────────────────────────────────────────────────────────

export function usePolicies(filters?: {
  status?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);

  const query = params.toString();

  return useQuery<PolicyData[]>({
    queryKey: ["policies", filters],
    queryFn: () => fetchApi<PolicyData[]>(`/api/policies${query ? `?${query}` : ""}`),
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Policy Detail ────────────────────────────────────────────────────────────

export function usePolicy(id: string) {
  return useQuery<PolicyDetail>({
    queryKey: ["policy", id],
    queryFn: () => fetchApi<PolicyDetail>(`/api/policies/${id}`),
    enabled: !!id,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Create Policy ────────────────────────────────────────────────────────────

export function useCreatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      category?: string;
      documentUrl?: string;
      documentId?: string;
      status?: PolicyStatus;
      requiresReack?: boolean;
    }) => {
      return mutateApi<PolicyData>("/api/policies", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ description: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update Policy ────────────────────────────────────────────────────────────

export function useUpdatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      category?: string | null;
      documentUrl?: string | null;
      documentId?: string | null;
      status?: PolicyStatus;
      requiresReack?: boolean;
      content?: string;
    }) => {
      return mutateApi<PolicyData>(`/api/policies/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      toast({ description: "Policy updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete Policy ────────────────────────────────────────────────────────────

export function useDeletePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/policies/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      toast({ description: "Policy deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Acknowledge Policy ───────────────────────────────────────────────────────

export function useAcknowledgePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policyId: string) => {
      return mutateApi(`/api/policies/${policyId}/acknowledge`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy-heat-map"] });
      toast({ description: "Policy acknowledged" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Compliance Dashboard ─────────────────────────────────────────────────────

export function usePolicyCompliance() {
  return useQuery<PolicyCompliance[]>({
    queryKey: ["policies-compliance"],
    queryFn: () => fetchApi<PolicyCompliance[]>("/api/policies/compliance"),
    staleTime: 60_000,
    retry: 2,
  });
}

// ── My Pending Policies ──────────────────────────────────────────────────────

export function useMyPendingPolicies() {
  return useQuery<PolicyData[]>({
    queryKey: ["my-pending-policies"],
    queryFn: () => fetchApi<PolicyData[]>("/api/policies/my-pending"),
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Policy Heat-Map ──────────────────────────────────────────────────────────

export interface PolicyHeatMapAck {
  policyId: string;
  policyVersion: number;
  acknowledgedAt: string;
}

export interface PolicyHeatMapRow {
  userId: string;
  userName: string;
  serviceName: string;
  serviceCode: string;
  acknowledgements: PolicyHeatMapAck[];
}

export interface PolicyHeatMapPolicy {
  id: string;
  title: string;
  version: number;
  category: string | null;
  publishedAt: string | null;
}

export interface PolicyHeatMapData {
  rows: PolicyHeatMapRow[];
  policies: PolicyHeatMapPolicy[];
  summary: {
    totalStaff: number;
    fullyAcknowledged: number;
    partial: number;
    none: number;
  };
}

export function usePolicyHeatMap() {
  return useQuery<PolicyHeatMapData>({
    queryKey: ["policy-heat-map"],
    queryFn: () => fetchApi<PolicyHeatMapData>("/api/policies/heat-map"),
    staleTime: 60_000,
    retry: 2,
  });
}
