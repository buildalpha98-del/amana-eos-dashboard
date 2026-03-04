"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch(`/api/compliance${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch compliance data");
      return res.json();
    },
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
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create certificate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
  });
}

export function useUpdateCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/compliance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update certificate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
  });
}

export function useDeleteCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/compliance/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete certificate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
  });
}
