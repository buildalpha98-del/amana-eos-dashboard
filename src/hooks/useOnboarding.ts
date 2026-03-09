"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface OnboardingTaskData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  sortOrder: number;
  isRequired: boolean;
  documentId: string | null;
}

export interface OnboardingPackData {
  id: string;
  name: string;
  description: string | null;
  serviceId: string | null;
  isDefault: boolean;
  service: { id: string; name: string; code: string } | null;
  _count: { tasks: number; assignments: number };
  tasks?: OnboardingTaskData[];
}

export interface OnboardingProgressData {
  id: string;
  taskId: string;
  completed: boolean;
  completedAt: string | null;
  notes: string | null;
  task: { id: string; title: string; category: string | null; isRequired: boolean; sortOrder: number };
}

export interface StaffOnboardingData {
  id: string;
  userId: string;
  packId: string;
  status: "not_started" | "in_progress" | "completed";
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  user: { id: string; name: string; email: string; avatar: string | null };
  pack: {
    id: string;
    name: string;
    description: string | null;
    service: { id: string; name: string; code: string } | null;
    _count: { tasks: number };
  };
  progress: OnboardingProgressData[];
}

export function useOnboardingPacks(serviceId?: string) {
  return useQuery<OnboardingPackData[]>({
    queryKey: ["onboarding-packs", serviceId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      const res = await fetch(`/api/onboarding/packs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch onboarding packs");
      return res.json();
    },
  });
}

export function useOnboardingPack(id: string | null) {
  return useQuery<OnboardingPackData & { tasks: OnboardingTaskData[]; assignments: StaffOnboardingData[] }>({
    queryKey: ["onboarding-pack", id],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding/packs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch onboarding pack");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/onboarding/packs", {
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
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
    },
  });
}

export function useUpdateOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/onboarding/packs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update pack");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack-detail"] });
    },
  });
}

export function useDeleteOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/onboarding/packs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete pack");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
    },
  });
}

export function useOnboardingAssignments(userId?: string) {
  return useQuery<StaffOnboardingData[]>({
    queryKey: ["onboarding-assignments", userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/onboarding/assign?${params}`);
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return res.json();
    },
  });
}

export function useAssignOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; packId: string; dueDate?: string }) => {
      const res = await fetch("/api/onboarding/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to assign pack");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
    },
  });
}

export function useUpdateOnboardingProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { onboardingId: string; taskId: string; completed: boolean; notes?: string }) => {
      const res = await fetch("/api/onboarding/assign", {
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
      qc.invalidateQueries({ queryKey: ["onboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
    },
  });
}
