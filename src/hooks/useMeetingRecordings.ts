"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { MeetingAiReview } from "@/lib/meeting-review";

export type RecordingStatus =
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "complete"
  | "failed";

export interface MeetingRecordingData {
  id: string;
  meetingId: string;
  source: "live_mic" | "upload";
  status: RecordingStatus;
  durationSeconds: number | null;
  transcriptText: string | null;
  aiReview: MeetingAiReview | null;
  error: string | null;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

const NON_TERMINAL: RecordingStatus[] = ["uploaded", "transcribing", "transcribed"];

export function useMeetingRecordings(meetingId: string, enabled = true) {
  return useQuery<MeetingRecordingData[]>({
    queryKey: ["meeting-recordings", meetingId],
    queryFn: () =>
      fetchApi<MeetingRecordingData[]>(`/api/meetings/${meetingId}/recordings`),
    enabled: enabled && !!meetingId,
    retry: 2,
    staleTime: 10_000,
    // Poll while anything is still moving through the pipeline.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => NON_TERMINAL.includes(r.status))
        ? 10_000
        : false,
  });
}

export function useCreateRecording(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      url: string;
      source: "live_mic" | "upload";
      durationSeconds?: number;
    }) =>
      mutateApi<MeetingRecordingData>(`/api/meetings/${meetingId}/recordings`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] });
      toast({ description: "Recording uploaded — transcribing now." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useRegenerateReview(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordingId: string) =>
      mutateApi<MeetingRecordingData>(
        `/api/meetings/${meetingId}/recordings/${recordingId}/regenerate`,
        { method: "POST", timeoutMs: 120_000 },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] });
      toast({ description: "AI review regenerated." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useActionItemDecision(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      recordingId: string;
      itemId: string;
      decision: "accept" | "dismiss";
      title?: string;
      assigneeId?: string;
      dueDate?: string;
    }) =>
      mutateApi<MeetingRecordingData>(
        `/api/meetings/${meetingId}/recordings/${data.recordingId}/action-items/${data.itemId}`,
        {
          method: "POST",
          body: {
            decision: data.decision,
            title: data.title,
            assigneeId: data.assigneeId,
            dueDate: data.dueDate,
          },
        },
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] });
      if (vars.decision === "accept") {
        queryClient.invalidateQueries({ queryKey: ["todos"] });
        toast({ description: "To-do created from the meeting." });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useMissedItemDecision(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      recordingId: string;
      itemId: string;
      decision: "action" | "dismiss";
    }) =>
      mutateApi<MeetingRecordingData>(
        `/api/meetings/${meetingId}/recordings/${data.recordingId}/missed-items/${data.itemId}`,
        { method: "POST", body: { decision: data.decision } },
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-recordings", meetingId] });
      if (vars.decision === "action") {
        queryClient.invalidateQueries({ queryKey: ["issues"] });
        toast({ description: "Issue raised from the meeting." });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
