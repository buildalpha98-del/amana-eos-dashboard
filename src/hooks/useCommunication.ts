"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function useAnnouncements(audience?: string) {
  return useQuery({
    queryKey: ["announcements", audience],
    queryFn: async () => {
      const params = audience ? `?audience=${audience}` : "";
      return fetchApi<any>(`/api/communication/announcements${params}`);
    },
    retry: 2,
  });
}

export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: ["announcement", id],
    queryFn: async () => {
      return fetchApi<any>(`/api/communication/announcements/${id}`);
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

export function useCascadeMessages() {
  return useQuery({
    queryKey: ["cascade-messages"],
    queryFn: async () => {
      return fetchApi<any>("/api/communication/cascade");
    },
    retry: 2,
  });
}

export function useCascadeMessage(id: string) {
  return useQuery({
    queryKey: ["cascade-message", id],
    queryFn: async () => {
      return fetchApi<any>(`/api/communication/cascade/${id}`);
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

export function usePulses(weekOf?: string, userId?: string) {
  return useQuery({
    queryKey: ["pulses", weekOf, userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (weekOf) params.set("weekOf", weekOf);
      if (userId) params.set("userId", userId);
      const qs = params.toString();
      return fetchApi<any>(
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
    queryKey: ["pulse", id],
    queryFn: async () => {
      return fetchApi<any>(`/api/communication/pulse/${id}`);
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

export function usePulseSummary(weekOf: string) {
  return useQuery({
    queryKey: ["pulse-summary", weekOf],
    queryFn: async () => {
      return fetchApi<any>(
        `/api/communication/pulse/summary?weekOf=${weekOf}`
      );
    },
    enabled: !!weekOf,
    retry: 2,
  });
}
