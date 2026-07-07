"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface InductionBlocker {
  kind: string;
  label: string;
  href: string;
}

export interface PracticalItem {
  id: string;
  title: string;
  description: string | null;
  signed: boolean;
  signedBy: string | null;
}

export interface InductionReadiness {
  userId: string;
  status: "new_starter" | "in_training" | "awaiting_signoff" | "cleared";
  dueDate: string | null;
  graceUntil: string | null;
  clearedAt: string | null;
  ready: boolean;
  blockers: InductionBlocker[];
  practical: PracticalItem[];
  practicalAllSigned: boolean;
}

/** The caller's readiness (or a target user's, when a userId is supplied by an admin). */
export function useInductionReadiness(userId?: string) {
  return useQuery<InductionReadiness>({
    queryKey: ["induction-readiness", userId ?? "self"],
    staleTime: 30_000,
    retry: 2,
    queryFn: async () =>
      fetchApi<InductionReadiness>(
        `/api/induction/readiness${userId ? `?userId=${userId}` : ""}`,
      ),
  });
}

/** Admin pipeline board data (users grouped by induction status). */
export interface PipelineRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  serviceName: string | null;
  status: string;
  dueDate: string | null;
  graceUntil: string | null;
  daysInStage: number;
}

export function useInductionPipeline() {
  return useQuery<{ rows: PipelineRow[] }>({
    queryKey: ["induction-pipeline"],
    staleTime: 30_000,
    retry: 2,
    queryFn: async () => fetchApi(`/api/induction/pipeline`),
  });
}

/** State Manager / Admin signs off one practical item for a new starter. */
export function useSignoffPractical() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; itemId: string; notes?: string }) =>
      mutateApi("/api/induction/signoff", { method: "POST", body: input }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["induction-readiness", vars.userId] });
      qc.invalidateQueries({ queryKey: ["induction-pipeline"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Owner / State Manager grants a temporary override window. */
export function useInductionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; until: string; reason: string }) =>
      mutateApi("/api/induction/override", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["induction-pipeline"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** One-time backfill launcher (owner / State Manager). */
export function useLaunchBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => mutateApi("/api/induction/backfill", { method: "POST" }),
    onSuccess: (data: unknown) => {
      const d = data as { enrolled?: number; movedToTraining?: number } | null;
      toast({
        description: `Backfill complete — ${d?.movedToTraining ?? 0} staff enrolled with a 5-week grace period.`,
      });
      qc.invalidateQueries({ queryKey: ["induction-pipeline"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
