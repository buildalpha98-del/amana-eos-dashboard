"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Announcement row as serialised by /api/communication/announcements. */
export interface CommunicationAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  pinned: boolean;
  serviceId: string | null;
  publishedAt: string | null;
  expiresAt?: string | null;
  createdAt: string;
  author: { id: string; name: string | null; avatar: string | null } | null;
  service?: { id: string; name: string } | null;
  _count?: { readReceipts: number };
  /** Only present on the single-announcement (detail) endpoint. */
  readReceipts?: Array<{
    id: string;
    readAt: string;
    user: { id: string; name: string | null };
  }>;
}

export function useAnnouncements(audience?: string) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["announcements", audience],
    queryFn: async () => {
      const params = audience ? `?audience=${audience}` : "";
      return fetchApi<CommunicationAnnouncement[]>(`/api/communication/announcements${params}`);
    },
    retry: 2,
  });
}

export function useAnnouncement(id: string) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["announcement", id],
    queryFn: async () => {
      return fetchApi<CommunicationAnnouncement>(`/api/communication/announcements/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      body: string;
      audience?: string;
      priority?: string;
      pinned?: boolean;
      serviceId?: string | null;
      publishedAt?: string | null;
    }) => {
      return mutateApi("/api/communication/announcements", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      body?: string;
      audience?: string;
      priority?: string;
      pinned?: boolean;
      serviceId?: string | null;
      publishedAt?: string | null;
      expiresAt?: string | null;
    }) => {
      return mutateApi(`/api/communication/announcements/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/communication/announcements/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/communication/announcements/${id}/read`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASCADE MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cascade message as serialised by /api/communication/cascade. The list
 * endpoint returns only the current user's acknowledgment (no `user`); the
 * detail endpoint returns every acknowledgment with its user.
 */
export interface CascadeMessageRecord {
  id: string;
  message: string;
  publishedAt: string;
  meeting: { id: string; title: string; date: string } | null;
  acknowledgments?: Array<{
    id?: string;
    acknowledgedAt?: string;
    user?: { id: string; name: string };
  }>;
  _count?: { acknowledgments: number };
}

export function useCascadeMessages() {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["cascade-messages"],
    queryFn: async () => {
      return fetchApi<CascadeMessageRecord[]>("/api/communication/cascade");
    },
    retry: 2,
  });
}

export function useCascadeMessage(id: string) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["cascade-message", id],
    queryFn: async () => {
      return fetchApi<CascadeMessageRecord>(`/api/communication/cascade/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function usePublishCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      meetingId: string;
      message: string;
    }) => {
      return mutateApi("/api/communication/cascade", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      message?: string;
    }) => {
      return mutateApi(`/api/communication/cascade/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
      queryClient.invalidateQueries({ queryKey: ["cascade-message"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/communication/cascade/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useAcknowledgeCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(
        `/api/communication/cascade/${id}/acknowledge`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
      queryClient.invalidateQueries({ queryKey: ["cascade-message"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY PULSE
// ═══════════════════════════════════════════════════════════════════════════════

/** Weekly pulse row as serialised by /api/communication/pulse. */
export interface WeeklyPulseRecord {
  id: string;
  /** Absent on the summary endpoint's trimmed rows. */
  weekOf?: string;
  userId?: string;
  wins: string | null;
  priorities: string | null;
  blockers: string | null;
  mood: number | null;
  notes: string | null;
  submittedAt: string | null;
  user?: {
    id: string;
    name: string | null;
    email?: string | null;
    avatar?: string | null;
  } | null;
}

export function usePulses(weekOf?: string, userId?: string) {
  return useQuery({
    queryKey: ["pulses", weekOf, userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (weekOf) params.set("weekOf", weekOf);
      if (userId) params.set("userId", userId);
      const qs = params.toString();
      return fetchApi<WeeklyPulseRecord[]>(
        `/api/communication/pulse${qs ? `?${qs}` : ""}`
      );
    },
    retry: 2,
    // Keep pulse data stable — prevents background refetches from returning
    // a new object reference mid-typing, which would otherwise fire the load
    // effect in WeeklyPulseTab and reset the user's in-progress input.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function usePulse(id: string) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["pulse", id],
    queryFn: async () => {
      return fetchApi<WeeklyPulseRecord>(`/api/communication/pulse/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useSubmitPulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      weekOf: string;
      wins?: string;
      priorities?: string;
      blockers?: string;
      mood?: number;
      notes?: string;
      submitted?: boolean;
    }) => {
      return mutateApi("/api/communication/pulse", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdatePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      wins?: string;
      priorities?: string;
      blockers?: string;
      mood?: number;
      notes?: string;
      submittedAt?: string | null;
    }) => {
      return mutateApi(`/api/communication/pulse/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeletePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/communication/pulse/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Response shape of /api/communication/pulse/summary. */
export interface PulseSummary {
  totalUsers: number;
  submitted: number;
  avgMood: number;
  blockerCount: number;
  pulses: WeeklyPulseRecord[];
}

export function usePulseSummary(weekOf: string) {
  return useQuery({
    staleTime: 30_000,
    queryKey: ["pulse-summary", weekOf],
    queryFn: async () => {
      return fetchApi<PulseSummary>(
        `/api/communication/pulse/summary?weekOf=${weekOf}`
      );
    },
    enabled: !!weekOf,
    retry: 2,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY PULSE — ADMIN VIEW (anonymous)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PulseServiceRow {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  totalUsers: number;
  submitted: number;
  positive: number;
  neutral: number;
  concerning: number;
  blockerCount: number;
}

export interface PulseAdminSummary {
  weekOf: string;
  org: {
    totalUsers: number;
    submitted: number;
    positive: number;
    neutral: number;
    concerning: number;
    blockerCount: number;
  };
  byService: PulseServiceRow[];
}

export function usePulseAdminSummary(weekOf: string, enabled: boolean) {
  return useQuery<PulseAdminSummary>({
    staleTime: 30_000,
    queryKey: ["pulse-admin-summary", weekOf],
    queryFn: () =>
      fetchApi<PulseAdminSummary>(`/api/communication/pulse/admin-summary?weekOf=${weekOf}`),
    enabled: enabled && !!weekOf,
    retry: 2,
  });
}

/** Nudge everyone who hasn't acknowledged a cascade yet (admin-tier). */
export function useRemindCascade() {
  return useMutation({
    mutationFn: async (id: string) =>
      mutateApi<{ reminded: number }>(
        `/api/communication/cascade/${id}/remind`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      toast({
        description:
          data.reminded > 0
            ? `Reminded ${data.reminded} team member${data.reminded === 1 ? "" : "s"}.`
            : "Everyone has already acknowledged.",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
