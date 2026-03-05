"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────

export interface OffboardingTaskData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  sortOrder: number;
  isRequired: boolean;
  assignedTo: string | null;
  documentId: string | null;
}

export interface OffboardingPackData {
  id: string;
  name: string;
  description: string | null;
  serviceId: string | null;
  isDefault: boolean;
  service: { id: string; name: string; code: string } | null;
  _count: { tasks: number; assignments: number };
  tasks?: OffboardingTaskData[];
}

export interface OffboardingProgressData {
  id: string;
  taskId: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
  notes: string | null;
  task: { id: string; title: string; category: string | null; isRequired: boolean; sortOrder: number };
}

export interface StaffOffboardingData {
  id: string;
  userId: string;
  packId: string;
  status: "not_started" | "in_progress" | "completed";
  initiatedById: string | null;
  lastDay: string | null;
  reason: string | null;
  exitInterviewNotes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  deactivateOnComplete: boolean;
  user: { id: string; name: string; email: string; avatar: string | null };
  pack: {
    id: string;
    name: string;
    description: string | null;
    service: { id: string; name: string; code: string } | null;
    _count: { tasks: number };
  };
  progress: OffboardingProgressData[];
}

// ── Hooks ──────────────────────────────────────────────────────

export function useOffboardingPacks(serviceId?: string) {
  return useQuery<OffboardingPackData[]>({
    queryKey: ["offboarding-packs", serviceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      const res = await fetch(`/api/offboarding/packs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch offboarding packs");
      return res.json();
    },
  });
}

export function useOffboardingPack(id: string | null) {
  return useQuery<OffboardingPackData & { tasks: OffboardingTaskData[]; assignments: StaffOffboardingData[] }>({
    queryKey: ["offboarding-pack", id],
    queryFn: async () => {
      const res = await fetch(`/api/offboarding/packs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch offboarding pack");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateOffboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/offboarding/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create pack");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-packs"] });
    },
  });
}

export function useOffboardingAssignments(userId?: string) {
  return useQuery<StaffOffboardingData[]>({
    queryKey: ["offboarding-assignments", userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/offboarding/assign?${params}`);
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json();
    },
  });
}

export function useInitiateOffboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      userId: string;
      packId: string;
      lastDay?: string;
      reason?: string;
    }) => {
      const res = await fetch("/api/offboarding/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to initiate offboarding");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["offboarding-pack"] });
    },
  });
}

export function useUpdateOffboardingProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      offboardingId: string;
      taskId: string;
      completed: boolean;
      notes?: string;
    }) => {
      const res = await fetch("/api/offboarding/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update progress");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["offboarding-pack"] });
    },
  });
}
