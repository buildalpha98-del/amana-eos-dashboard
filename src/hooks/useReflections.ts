"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { offlineQueue } from "@/lib/offline-queue";

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
  return useMutation<ReflectionItem | { queued: true }, Error, CreateReflectionArgs>({
    mutationFn: async (body) => {
      const url = `/api/services/${serviceId}/reflections`;
      try {
        return await mutateApi<ReflectionItem>(url, { method: "POST", body });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const isTransient =
          msg.includes("NetworkError") ||
          msg.toLowerCase().includes("failed to fetch") ||
          msg.startsWith("HTTP 5");
        if (!isTransient || !body.clientMutationId) throw err;
        await offlineQueue.enqueue({
          id: body.clientMutationId,
          url,
          method: "POST",
          body: body as unknown as Record<string, unknown>,
        });
        toast({ description: "Reflection saved offline — will sync when you're back online." });
        return { queued: true as const };
      }
    },
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
