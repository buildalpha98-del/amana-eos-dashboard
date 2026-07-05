"use client";

/**
 * useMorningBrief — today's AI morning brief for the session user.
 * Produced by the morning-briefing cron; null until it runs (the card
 * hides itself). Mark-read collapses the card for the rest of the day.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface MorningBriefData {
  id: string;
  date: string;
  content: string;
  signals: Record<string, unknown> | null;
  source: "ai" | "fallback";
  readAt: string | null;
  createdAt: string;
}

export function useMorningBrief() {
  return useQuery<{ briefing: MorningBriefData | null }>({
    queryKey: ["morning-brief"],
    queryFn: () => fetchApi<{ briefing: MorningBriefData | null }>("/api/me/briefing"),
    retry: 2,
    // One brief per day — no need to refetch aggressively.
    staleTime: 10 * 60_000,
  });
}

export function useMarkBriefRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mutateApi("/api/me/briefing", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["morning-brief"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
