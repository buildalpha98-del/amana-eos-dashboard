"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { offlineQueue } from "@/lib/offline-queue";

export interface ReflectionItem {
  id: string;
  serviceId: string;
  authorId: string;
  type: "daily" | "weekly" | "monthly" | "critical" | "team";
  title: string;
  content: string;
  qualityAreas: number[];
  linkedObservationIds: string[];
  mood: "positive" | "neutral" | "concern" | null;
  mtopOutcomes: string[];
  parentPostId: string | null;
  aiTagged: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatar: string | null };
}

interface Listing {
  items: ReflectionItem[];
  nextCursor?: string;
}

export interface ReflectionFilters {
  type?: "daily" | "weekly" | "monthly" | "critical" | "team";
  qa?: number;
  authorId?: string;
  /** ISO date strings — filter createdAt range (used by the Mon–Fri strip). */
  from?: string;
  to?: string;
}

export function useReflections(
  serviceId: string | undefined,
  filters?: ReflectionFilters,
) {
  const qs = new URLSearchParams();
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.qa) qs.set("qa", String(filters.qa));
  if (filters?.authorId) qs.set("authorId", filters.authorId);
  if (filters?.from) qs.set("from", filters.from);
  if (filters?.to) qs.set("to", filters.to);

  return useQuery<Listing>({
    queryKey: [
      "reflections",
      serviceId,
      filters?.type,
      filters?.qa,
      filters?.authorId,
      filters?.from,
      filters?.to,
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
  mtopOutcomes?: string[];
  /** Daily-type fan-out: children to mint LearningObservations for. */
  childIds?: string[];
  /** Daily-type fan-out: also publish a ParentPost. */
  shareWithParents?: boolean;
  clientMutationId?: string;
}

export interface UpdateReflectionArgs {
  reflectionId: string;
  type?: ReflectionItem["type"];
  title?: string;
  content?: string;
  qualityAreas?: number[];
  mood?: ReflectionItem["mood"];
  linkedObservationIds?: string[];
}

export function useUpdateReflection(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<ReflectionItem, Error, UpdateReflectionArgs>({
    mutationFn: async ({ reflectionId, ...body }) =>
      mutateApi<ReflectionItem>(
        `/api/services/${serviceId}/reflections/${reflectionId}`,
        { method: "PATCH", body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reflections", serviceId] });
      toast({ description: "Reflection updated" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to update reflection",
      });
    },
  });
}

export function useDeleteReflection(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { reflectionId: string }>({
    mutationFn: async ({ reflectionId }) =>
      mutateApi<{ ok: true }>(
        `/api/services/${serviceId}/reflections/${reflectionId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reflections", serviceId] });
      toast({ description: "Reflection deleted" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to delete reflection",
      });
    },
  });
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
