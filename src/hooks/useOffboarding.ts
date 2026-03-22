"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
    queryFn: () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      return fetchApi<OffboardingPackData[]>(`/api/offboarding/packs?${params}`);
    },
    retry: 2,
  });
}

export function useOffboardingPack(id: string | null) {
  return useQuery<OffboardingPackData & { tasks: OffboardingTaskData[]; assignments: StaffOffboardingData[] }>({
    queryKey: ["offboarding-pack", id],
    queryFn: () => fetchApi(`/api/offboarding/packs/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateOffboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return mutateApi("/api/offboarding/packs", { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-packs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useOffboardingAssignments(userId?: string) {
  return useQuery<StaffOffboardingData[]>({
    queryKey: ["offboarding-assignments", userId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      return fetchApi<StaffOffboardingData[]>(`/api/offboarding/assign?${params}`);
    },
    retry: 2,
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
      return mutateApi("/api/offboarding/assign", { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["offboarding-pack"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi("/api/offboarding/assign", { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["offboarding-pack"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
