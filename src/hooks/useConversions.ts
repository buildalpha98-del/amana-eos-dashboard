"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ConversionOpportunity {
  id: string;
  serviceId: string;
  service: { id: string; name: string; code: string };
  familyRef: string;
  sessionType: "bsc" | "asc";
  casualCount: number;
  periodStart: string;
  periodEnd: string;
  status: "identified" | "contacted" | "converted" | "declined";
  contactedAt: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionStats {
  total: number;
  identified: number;
  contacted: number;
  converted: number;
  declined: number;
  totalCasualBookings: number;
}

interface ConversionsResponse {
  opportunities: ConversionOpportunity[];
  stats: ConversionStats;
}

export function useConversions(filters?: {
  serviceId?: string;
  status?: string;
  sessionType?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.sessionType) params.set("sessionType", filters.sessionType);
  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery<ConversionsResponse>({
    queryKey: ["conversions", filters],
    queryFn: async () => {
      const res = await fetch(`/api/conversions${qs}`);
      if (!res.ok) throw new Error("Failed to fetch conversions");
      return res.json();
    },
  });
}

export function useUpdateConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      status: string;
      notes?: string;
    }) => {
      const res = await fetch("/api/conversions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] });
    },
  });
}
