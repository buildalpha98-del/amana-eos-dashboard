"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { RampRecommendation, RampStatus } from "@prisma/client";
import type { RampScorecard } from "@/lib/ramp/scorecard";

export interface RampCheckInItem {
  id: string;
  weekNumber: number;
  dueAt: string;
  sentAt: string | null;
  skipped: boolean;
  submittedAt: string | null;
  mood: number | null;
  wentWell: string | null;
  struggling: string | null;
  needsHelp: boolean | null;
  helpDetail: string | null;
  flaggedAt: string | null;
}

export interface RampCheckpointItem {
  id: string;
  day: number;
  dueAt: string;
  sentAt: string | null;
  submittedAt: string | null;
  reviewer: { id: string; name: string } | null;
  ratings: Record<string, number>;
  summary: string | null;
  recommendation: RampRecommendation | null;
}

export interface RampDetail {
  ramp: {
    id: string;
    status: RampStatus;
    startDate: string;
    endDate: string;
    completedAt: string | null;
    probationReviewId: string | null;
    user: { id: string; name: string; service: { id: string; name: string } | null };
  };
  scorecard: RampScorecard;
  checkIns: RampCheckInItem[];
  checkpoints: RampCheckpointItem[];
  permissions: { canReview: boolean; isSelf: boolean };
}

export interface RampListRow {
  id: string;
  status: RampStatus;
  startDate: string;
  endDate: string;
  user: { id: string; name: string; avatar: string | null; service: { id: string; name: string } | null };
  day: number;
  overall: RampScorecard["overall"];
  lastMood: number | null;
  recentFlags: number;
  behind: number;
  nextCheckIn: { weekNumber: number; dueAt: string } | null;
  nextCheckpoint: { day: number; dueAt: string; overdue: boolean } | null;
}

/** 404 = "no ramp for this person" — a normal state, not an error. */
export function useRamp(userId: string, enabled = true) {
  return useQuery<RampDetail | null>({
    queryKey: ["ramp", userId],
    queryFn: async () => {
      try {
        return await fetchApi<RampDetail>(`/api/ramps/${userId}`);
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },
    enabled,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRamps(status?: "completed" | "ended") {
  return useQuery<{ ramps: RampListRow[] }>({
    queryKey: ["ramps", status ?? "open"],
    queryFn: () => fetchApi(`/api/ramps${status ? `?status=${status}` : ""}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface SubmitCheckpointInput {
  day: number;
  ratings: Record<string, number>;
  summary?: string;
  recommendation: RampRecommendation;
}

export function useSubmitRampCheckpoint(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitCheckpointInput) =>
      mutateApi(`/api/ramps/${userId}/checkpoints/${input.day}`, {
        method: "POST",
        body: { ratings: input.ratings, summary: input.summary, recommendation: input.recommendation },
      }),
    onSuccess: (_data, input) => {
      toast({ description: `Day ${input.day} checkpoint submitted.` });
      qc.invalidateQueries({ queryKey: ["ramp", userId] });
      qc.invalidateQueries({ queryKey: ["ramps"] });
      qc.invalidateQueries({ queryKey: ["performance-reviews"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
