"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface ReflectionItem {
  id: string;
  serviceId: string;
  authorId: string;
  type: "weekly" | "monthly" | "critical" | "team";
  title: string;
  content: string;
  qualityAreas: number[];
  linkedObservationIds: string[];
  mood: "positive" | "neutral" | "concern" | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatar: string | null };
}

interface Listing {
  items: ReflectionItem[];
  nextCursor?: string;
}

export interface ReflectionFilters {
  type?: "weekly" | "monthly" | "critical" | "team";
  qa?: number;
  authorId?: string;
}

export function useReflections(
  serviceId: string | undefined,
  filters?: ReflectionFilters,
) {
  const qs = new URLSearchParams();
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.qa) qs.set("qa", String(filters.qa));
  if (filters?.authorId) qs.set("authorId", filters.authorId);

  return useQuery<Listing>({
    queryKey: [
      "reflections",
      serviceId,
      filters?.type,
      filters?.qa,
      filters?.authorId,
    ],
    queryFn: () =>
      fetchApi<Listing>(
        `/api/services/${serviceId}/reflections?${qs.toString()}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateReflectionArgs {
  type: ReflectionItem["type"];
  title: string;
  content: string;
  qualityAreas?: number[];
  mood?: ReflectionItem["mood"];
  linkedObservationIds?: string[];
  clientMutationId?: string;
}

export function useCreateReflection(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<ReflectionItem, Error, CreateReflectionArgs>({
    mutationFn: (body) =>
      mutateApi<ReflectionItem>(`/api/services/${serviceId}/reflections`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reflections", serviceId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save reflection",
      });
    },
  });
}
