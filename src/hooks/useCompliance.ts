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
  expiryDate: string;
  notes: string | null;
  fileUrl: string | null;
  fileName: string | null;
  alertDays: number;
  acknowledged: boolean;
  createdAt: string;
}

export function useComplianceCerts(filters?: { serviceId?: string; upcoming?: string }) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.upcoming) params.set("upcoming", filters.upcoming);
  const query = params.toString();

  return useQuery<ComplianceCertData[]>({
    queryKey: ["compliance", filters],
    queryFn: () => fetchApi<ComplianceCertData[]>(`/api/compliance${query ? `?${query}` : ""}`),
    retry: 2,
  });
}

export function useCreateCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      serviceId: string;
      userId?: string | null;
      type: string;
      label?: string | null;
      issueDate: string;
      expiryDate: string;
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
