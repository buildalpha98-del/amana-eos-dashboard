"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function useAnnouncements(audience?: string) {
  return useQuery({
    queryKey: ["announcements", audience],
    queryFn: async () => {
      const params = audience ? `?audience=${audience}` : "";
      const res = await fetch(`/api/communication/announcements${params}`);
      if (!res.ok) throw new Error("Failed to fetch announcements");
      return res.json();
    },
  });
}

export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: ["announcement", id],
    queryFn: async () => {
      const res = await fetch(`/api/communication/announcements/${id}`);
      if (!res.ok) throw new Error("Failed to fetch announcement");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/communication/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create announcement");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
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
      const res = await fetch(`/api/communication/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update announcement");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement"] });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communication/announcements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete announcement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communication/announcements/${id}/read`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to mark announcement as read");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement"] });
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
      const res = await fetch("/api/communication/cascade");
      if (!res.ok) throw new Error("Failed to fetch cascade messages");
      return res.json();
    },
  });
}

export function useCascadeMessage(id: string) {
  return useQuery({
    queryKey: ["cascade-message", id],
    queryFn: async () => {
      const res = await fetch(`/api/communication/cascade/${id}`);
      if (!res.ok) throw new Error("Failed to fetch cascade message");
      return res.json();
    },
    enabled: !!id,
  });
}

export function usePublishCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      meetingId: string;
      message: string;
    }) => {
      const res = await fetch("/api/communication/cascade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to publish cascade message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
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
      const res = await fetch(`/api/communication/cascade/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update cascade message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
      queryClient.invalidateQueries({ queryKey: ["cascade-message"] });
    },
  });
}

export function useDeleteCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communication/cascade/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete cascade message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
    },
  });
}

export function useAcknowledgeCascade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/communication/cascade/${id}/acknowledge`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to acknowledge cascade message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cascade-messages"] });
      queryClient.invalidateQueries({ queryKey: ["cascade-message"] });
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
      const res = await fetch(
        `/api/communication/pulse${qs ? `?${qs}` : ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch pulses");
      return res.json();
    },
  });
}

export function usePulse(id: string) {
  return useQuery({
    queryKey: ["pulse", id],
    queryFn: async () => {
      const res = await fetch(`/api/communication/pulse/${id}`);
      if (!res.ok) throw new Error("Failed to fetch pulse");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/communication/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit pulse");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
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
      const res = await fetch(`/api/communication/pulse/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update pulse");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
    },
  });
}

export function useDeletePulse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communication/pulse/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete pulse");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pulses"] });
      queryClient.invalidateQueries({ queryKey: ["pulse-summary"] });
    },
  });
}

export function usePulseSummary(weekOf: string) {
  return useQuery({
    queryKey: ["pulse-summary", weekOf],
    queryFn: async () => {
      const res = await fetch(
        `/api/communication/pulse/summary?weekOf=${weekOf}`
      );
      if (!res.ok) throw new Error("Failed to fetch pulse summary");
      return res.json();
    },
    enabled: !!weekOf,
  });
}
