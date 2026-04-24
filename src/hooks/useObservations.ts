"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export type MtopOutcome =
  | "Identity"
  | "Community"
  | "Wellbeing"
  | "Learners"
  | "Communicators";

export interface ObservationItem {
  id: string;
  childId: string;
  serviceId: string;
  authorId: string;
  title: string;
  narrative: string;
  mtopOutcomes: MtopOutcome[];
  interests: string[];
  mediaUrls: string[];
  visibleToParent: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatar: string | null };
  child: { id: string; firstName: string; surname: string };
}

interface Listing {
  items: ObservationItem[];
  nextCursor?: string;
}

export interface ObservationFilters {
  childId?: string;
  mtop?: MtopOutcome;
  authorId?: string;
}

export function useObservations(
  serviceId: string | undefined,
  filters?: ObservationFilters,
) {
  const qs = new URLSearchParams();
  if (filters?.childId) qs.set("childId", filters.childId);
  if (filters?.mtop) qs.set("mtop", filters.mtop);
  if (filters?.authorId) qs.set("authorId", filters.authorId);

  return useQuery<Listing>({
    queryKey: [
      "observations",
      serviceId,
      filters?.childId,
      filters?.mtop,
      filters?.authorId,
    ],
    queryFn: () =>
      fetchApi<Listing>(
        `/api/services/${serviceId}/observations?${qs.toString()}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateObservationArgs {
  childId: string;
  title: string;
  narrative: string;
  mtopOutcomes?: MtopOutcome[];
  interests?: string[];
  mediaUrls?: string[];
  visibleToParent?: boolean;
  clientMutationId?: string;
}

export function useCreateObservation(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<ObservationItem, Error, CreateObservationArgs>({
    mutationFn: (body) =>
      mutateApi<ObservationItem>(`/api/services/${serviceId}/observations`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["observations", serviceId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to save observation",
      });
    },
  });
}

// Parent-side: only returns visibleToParent=true observations for a child
export interface ParentObservationItem {
  id: string;
  title: string;
  narrative: string;
  mtopOutcomes: MtopOutcome[];
  interests: string[];
  mediaUrls: string[];
  createdAt: string;
  author: { name: string };
}

export function useParentChildObservations(childId: string | undefined) {
  return useQuery<{ items: ParentObservationItem[] }>({
    queryKey: ["parent-child-observations", childId],
    queryFn: () =>
      fetchApi<{ items: ParentObservationItem[] }>(
        `/api/parent/children/${childId}/observations`,
      ),
    enabled: !!childId,
    retry: 2,
    staleTime: 30_000,
  });
}
