"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface MeetingSeriesData {
  id: string;
  name: string;
  dayOfWeek: number;
  minuteOfDay: number;
  timezone: string;
  isLeadership: boolean;
  serviceIds: string[];
  scorecardId: string | null;
  attendeeUserIds: string[];
  active: boolean;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  _count?: { meetings: number };
  createdAt: string;
  updatedAt: string;
}

export function useMeetingSeries() {
  return useQuery<MeetingSeriesData[]>({
    queryKey: ["meeting-series"],
    queryFn: () => fetchApi<MeetingSeriesData[]>("/api/meetings/series"),
    retry: 2,
    staleTime: 60_000,
  });
}

export function useCreateMeetingSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      dayOfWeek: number;
      minuteOfDay: number;
      timezone?: string;
      isLeadership?: boolean;
      serviceIds?: string[];
      scorecardId?: string | null;
      attendeeUserIds?: string[];
    }) =>
      mutateApi<MeetingSeriesData>("/api/meetings/series", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-series"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateMeetingSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; active?: boolean; name?: string }) =>
      mutateApi<MeetingSeriesData>(`/api/meetings/series/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-series"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteMeetingSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ ok: true }>(`/api/meetings/series/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-series"] });
      toast({ description: "Recurring series deleted." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
