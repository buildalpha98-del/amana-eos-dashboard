"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { PolicyDocumentCategory } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolicyVersionSummary {
  id: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export interface PolicyDocumentListItem {
  id: string;
  title: string;
  description: string | null;
  category: PolicyDocumentCategory;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: PolicyVersionSummary | null;
  myAcknowledgedAt: string | null;
}

export interface PolicyDocumentDetail extends PolicyDocumentListItem {
  currentVersionId: string | null;
  versions: PolicyVersionSummary[];
}

export interface PolicyAcknowledgementRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  versionId: string;
  versionNumber: number;
  acknowledgedAt: string;
}

export interface PolicyAcknowledgementsReport {
  documentId: string;
  currentVersionNumber: number | null;
  totalStaff: number;
  currentVersionAcked: number;
  acknowledgements: PolicyAcknowledgementRow[];
}

// ── Policies List ────────────────────────────────────────────────────────────

export function usePolicies(filters?: { category?: PolicyDocumentCategory; includeArchived?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.includeArchived) params.set("includeArchived", "true");
  const query = params.toString();

  return useQuery<PolicyDocumentListItem[]>({
    queryKey: ["policies", filters?.category, filters?.includeArchived],
    queryFn: () => fetchApi<PolicyDocumentListItem[]>(`/api/policies${query ? `?${query}` : ""}`),
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Policy Detail ────────────────────────────────────────────────────────────

export function usePolicy(id: string | undefined) {
  return useQuery<PolicyDocumentDetail>({
    queryKey: ["policy", id],
    queryFn: () => fetchApi<PolicyDocumentDetail>(`/api/policies/${id}`),
    enabled: !!id,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Acknowledgement Report ───────────────────────────────────────────────────

export function usePolicyAcknowledgements(id: string | undefined) {
  return useQuery<PolicyAcknowledgementsReport>({
    queryKey: ["policy-acks", id],
    queryFn: () => fetchApi<PolicyAcknowledgementsReport>(`/api/policies/${id}/acknowledgements`),
    enabled: !!id,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Create Policy (multipart upload) ─────────────────────────────────────────

async function postMultipart<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function useCreatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      category: PolicyDocumentCategory;
      file: File;
    }) => {
      const form = new FormData();
      form.append("title", data.title);
      if (data.description) form.append("description", data.description);
      form.append("category", data.category);
      form.append("file", data.file);
      return postMultipart<PolicyDocumentDetail>("/api/policies", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies-count"] });
      toast({ description: "Policy uploaded" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Upload New Version ───────────────────────────────────────────────────────

export function useUploadPolicyVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return postMultipart<PolicyVersionSummary>(`/api/policies/${documentId}/versions`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy", documentId] });
      queryClient.invalidateQueries({ queryKey: ["policy-acks", documentId] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies-count"] });
      toast({
        description: "New version uploaded. All staff will be required to re-acknowledge.",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update Policy Details ────────────────────────────────────────────────────

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
      category?: PolicyDocumentCategory;
    }) =>
      mutateApi<PolicyDocumentListItem>(`/api/policies/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy", vars.id] });
      toast({ description: "Policy updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Archive / Unarchive ──────────────────────────────────────────────────────

export function useArchivePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isArchived = true }: { id: string; isArchived?: boolean }) =>
      mutateApi<{ id: string; isArchived: boolean }>(`/api/policies/${id}/archive`, {
        method: "PATCH",
        body: { isArchived },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies-count"] });
      toast({ description: "Policy archived" });
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
    mutationFn: async (documentId: string) =>
      mutateApi<{ id: string; acknowledgedAt: string }>(
        `/api/policies/${documentId}/acknowledge`,
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies"] });
      queryClient.invalidateQueries({ queryKey: ["my-pending-policies-count"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── My Pending Policies + Count ──────────────────────────────────────────────

export function useMyPendingPolicies() {
  return useQuery<PolicyDocumentListItem[]>({
    queryKey: ["my-pending-policies"],
    queryFn: () => fetchApi<PolicyDocumentListItem[]>("/api/policies/my-pending"),
    staleTime: 30_000,
    retry: 2,
  });
}

export function useMyPendingPoliciesCount() {
  return useQuery<{ count: number }>({
    queryKey: ["my-pending-policies-count"],
    queryFn: () => fetchApi<{ count: number }>("/api/policies/my-pending/count"),
    staleTime: 60_000,
    retry: 2,
  });
}
