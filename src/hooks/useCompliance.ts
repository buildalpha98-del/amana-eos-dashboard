"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ComplianceCertData {
  id: string;
  serviceId: string;
  service: { id: string; name: string; code: string };
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  type: string;
  label: string | null;
  issueDate: string;
  // Nullable since the schema migration made expiryDate optional for certs
  // that don't expire (e.g. annual ack, induction confirmation).
  expiryDate: string | null;
  notes: string | null;
  fileUrl: string | null;
  fileName: string | null;
  alertDays: number;
  acknowledged: boolean;
  createdAt: string;
}

export function useComplianceCerts(filters?: {
  serviceId?: string;
  upcoming?: string;
  /** 2026-06-05: pass "self" from the personal /compliance portal so
   *  the API forces a strict userId=self filter regardless of role.
   *  Closes the leakage where a `member` (OSHC Coordinator) saw
   *  service-wide certs on their *own* compliance page. */
  scope?: "self";
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.upcoming) params.set("upcoming", filters.upcoming);
  if (filters?.scope) params.set("scope", filters.scope);
  const query = params.toString();

  return useQuery<ComplianceCertData[]>({
    staleTime: 30_000,
    queryKey: ["compliance", filters?.serviceId, filters?.upcoming, filters?.scope],
    queryFn: () => fetchApi<ComplianceCertData[]>(`/api/compliance${query ? `?${query}` : ""}`),
    retry: 2,
  });
}

export function useCreateCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      // 2026-06-05: serviceId relaxed to optional/nullable — personal
      // certs (WWCC etc.) belong to the staff member, not a centre.
      // The server falls back to session.user.serviceId for staff/
      // member uploads and stores null if that's also empty.
      serviceId?: string | null;
      userId?: string | null;
      type: string;
      label?: string | null;
      issueDate: string;
      // Nullable — pass null for "no expiry" certs (e.g. annual ack).
      expiryDate: string | null;
      notes?: string | null;
      alertDays?: number;
      fileUrl?: string | null;
      fileName?: string | null;
    }) => {
      return mutateApi("/api/compliance", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      return mutateApi(`/api/compliance/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/compliance/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
