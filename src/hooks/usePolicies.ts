"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
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
    queryFn: async () => {
      const res = await fetch(`/api/policies${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch policies");
      return res.json();
    },
  });
}

// ── Policy Detail ────────────────────────────────────────────────────────────

export function usePolicy(id: string) {
  return useQuery<PolicyDetail>({
    queryKey: ["policy", id],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${id}`);
      if (!res.ok) throw new Error("Failed to fetch policy");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create policy");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ description: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ description: err.message });
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
      const res = await fetch(`/api/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update policy");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      toast({ description: "Policy updated" });
    },
    onError: (err: Error) => {
      toast({ description: err.message });
    },
  });
}

// ── Delete Policy ────────────────────────────────────────────────────────────

export function useDeletePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/policies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete policy");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      toast({ description: "Policy deleted" });
    },
    onError: (err: Error) => {
      toast({ description: err.message });
    },
  });
}

// ── Acknowledge Policy ───────────────────────────────────────────────────────

export function useAcknowledgePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policyId: string) => {
      const res = await fetch(`/api/policies/${policyId}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to acknowledge policy");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      queryClient.invalidateQueries({ queryKey: ["policies-compliance"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      toast({ description: "Policy acknowledged" });
    },
    onError: (err: Error) => {
      toast({ description: err.message });
    },
  });
}

// ── Compliance Dashboard ─────────────────────────────────────────────────────

export function usePolicyCompliance() {
  return useQuery<PolicyCompliance[]>({
    queryKey: ["policies-compliance"],
    queryFn: async () => {
      const res = await fetch("/api/policies/compliance");
      if (!res.ok) throw new Error("Failed to fetch policy compliance");
      return res.json();
    },
  });
}

// ── My Pending Policies ──────────────────────────────────────────────────────

export function useMyPendingPolicies() {
  return useQuery<PolicyData[]>({
    queryKey: ["my-pending-policies"],
    queryFn: async () => {
      const res = await fetch("/api/policies/my-pending");
      if (!res.ok) throw new Error("Failed to fetch pending policies");
      return res.json();
    },
  });
}
