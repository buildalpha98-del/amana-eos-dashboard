"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { MeetingStatus } from "@prisma/client";

export interface MeetingUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface MeetingCascade {
  id: string;
  message: string;
  publishedAt: string;
  createdAt: string;
}

export interface MeetingAttendee {
  id: string;
  meetingId: string;
  userId: string;
  user: { id: string; name: string; email: string };
  status: "present" | "absent";
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

/** AI-prepared L10 agenda draft (2026-07-05, draft-first meetings). */
export interface MeetingAgendaDraft {
  summary: string;
  idsOrder: Array<{ issueId: string; title: string; reason: string }>;
  scorecardCommentary: string;
  rockSuggestions: Array<{ rockId: string; title: string; suggestion: string }>;
}

export interface MeetingData {
  id: string;
  title: string;
  date: string;
  status: MeetingStatus;
  currentSection: number;
  rating: number | null;
  notes: string | null;
  headlines: string | null;
  segueNotes: string | null;
  concludeNotes: string | null;
  cascadeMessages: string | null;
  serviceIds: string[];
  rockIds: string[];
  startedAt: string | null;
  completedAt: string | null;
  createdById: string;
  createdBy: MeetingUser;
  cascades?: MeetingCascade[];
  attendees?: MeetingAttendee[];
  aiAgendaDraft?: MeetingAgendaDraft | null;
  aiAgendaDraftAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useMeetings(filters?: { status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const query = params.toString();

  return useQuery<MeetingData[]>({
    queryKey: ["meetings", filters?.status, filters?.limit],
    queryFn: () => fetchApi<MeetingData[]>(`/api/meetings${query ? `?${query}` : ""}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useMeeting(id: string) {
  return useQuery<MeetingData>({
    queryKey: ["meeting", id],
    queryFn: () => fetchApi<MeetingData>(`/api/meetings/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      date: string;
      serviceIds?: string[];
      attendeeIds?: string[];
    }) => {
      return mutateApi<MeetingData>("/api/meetings", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Draft (or regenerate) the AI agenda for a meeting. */
export function usePrepareMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi<{ draft: MeetingAgendaDraft }>(
        `/api/meetings/${id}/prepare`,
        // AI drafting can take a while — give it more than the default.
        { method: "POST", timeoutMs: 120_000 },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meeting"] });
      toast({ description: "AI agenda draft is ready." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      status?: MeetingStatus;
      currentSection?: number;
      rating?: number | null;
      notes?: string | null;
      headlines?: string | null;
      segueNotes?: string | null;
      concludeNotes?: string | null;
      cascadeMessages?: string | null;
      serviceIds?: string[];
      rockIds?: string[];
      attendeeUpdates?: { userId: string; status?: "present" | "absent"; rating?: number }[];
    }) => {
      return mutateApi(`/api/meetings/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meeting"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
