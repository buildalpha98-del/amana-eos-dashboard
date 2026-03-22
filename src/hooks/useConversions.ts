"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

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
    queryFn: () => fetchApi<ConversionsResponse>(`/api/conversions${qs}`),
    retry: 2,
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
      return mutateApi<ConversionOpportunity>("/api/conversions", {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
