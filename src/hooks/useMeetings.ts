"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeetingStatus } from "@prisma/client";

export interface MeetingUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
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
  startedAt: string | null;
  completedAt: string | null;
  createdById: string;
  createdBy: MeetingUser;
  createdAt: string;
  updatedAt: string;
}

export function useMeetings(filters?: { status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const query = params.toString();

  return useQuery<MeetingData[]>({
    queryKey: ["meetings", filters],
    queryFn: async () => {
      const res = await fetch(`/api/meetings${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch meetings");
      return res.json();
    },
  });
}

export function useMeeting(id: string) {
  return useQuery<MeetingData>({
    queryKey: ["meeting", id],
    queryFn: async () => {
      const res = await fetch(`/api/meetings/${id}`);
      if (!res.ok) throw new Error("Failed to fetch meeting");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; date: string }) => {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create meeting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
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
    }) => {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update meeting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meeting"] });
    },
  });
}
