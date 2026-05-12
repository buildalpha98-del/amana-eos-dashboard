"use client";

/**
 * Multi-scorecard hooks. Stage 3 of Bucket O.
 *
 * The legacy singleton `useScorecard()` in `./useScorecard.ts` still
 * exists and hits `/api/scorecard` — used by service-level scorecard
 * views that haven't migrated yet. Anything new should use these
 * hooks against the plural `/api/scorecards/*` family.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ScorecardData } from "@/hooks/useScorecard";

export interface ScorecardSummary {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  _count: { measurables: number; members: number };
}

export interface ScorecardMember {
  id: string;
  addedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
}

export function useScorecardsList() {
  return useQuery<{ scorecards: ScorecardSummary[] }>({
    queryKey: ["scorecards-list"],
    queryFn: () => fetchApi<{ scorecards: ScorecardSummary[] }>("/api/scorecards"),
    staleTime: 60_000,
    retry: 2,
  });
}

export function useScorecardDetail(id: string | null | undefined) {
  return useQuery<ScorecardData>({
    queryKey: ["scorecard-detail", id ?? "none"],
    queryFn: () => fetchApi<ScorecardData>(`/api/scorecards/${id}`),
    enabled: !!id,
    staleTime: 2 * 60_000,
    retry: 2,
  });
}

export function useScorecardMembers(id: string | null | undefined) {
  return useQuery<{ members: ScorecardMember[] }>({
    queryKey: ["scorecard-members", id ?? "none"],
    queryFn: () => fetchApi<{ members: ScorecardMember[] }>(
      `/api/scorecards/${id}/members`,
    ),
    enabled: !!id,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useCreateScorecard() {
  const qc = useQueryClient();
  return useMutation<ScorecardSummary, Error, { title: string }>({
    mutationFn: ({ title }) =>
      mutateApi<ScorecardSummary>("/api/scorecards", {
        method: "POST",
        body: { title },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scorecards-list"] });
      toast({ description: "Scorecard created" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to create scorecard",
      });
    },
  });
}

export function useRenameScorecard() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; title: string }>({
    mutationFn: ({ id, title }) =>
      mutateApi(`/api/scorecards/${id}`, {
        method: "PATCH",
        body: { title },
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["scorecards-list"] });
      qc.invalidateQueries({ queryKey: ["scorecard-detail", vars.id] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to rename",
      });
    },
  });
}

export function useDeleteScorecard() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string }>({
    mutationFn: ({ id }) =>
      mutateApi(`/api/scorecards/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scorecards-list"] });
      toast({ description: "Scorecard deleted" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to delete",
      });
    },
  });
}

export function useInviteScorecardMember(scorecardId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: string }>({
    mutationFn: ({ userId }) =>
      mutateApi(`/api/scorecards/${scorecardId}/members`, {
        method: "POST",
        body: { userId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["scorecard-members", scorecardId],
      });
      qc.invalidateQueries({ queryKey: ["scorecards-list"] });
      toast({ description: "Member invited" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to invite",
      });
    },
  });
}

export function useRemoveScorecardMember(scorecardId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: string }>({
    mutationFn: ({ userId }) =>
      mutateApi(`/api/scorecards/${scorecardId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["scorecard-members", scorecardId],
      });
      qc.invalidateQueries({ queryKey: ["scorecards-list"] });
      toast({ description: "Member removed" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to remove",
      });
    },
  });
}
