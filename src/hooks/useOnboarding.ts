"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
      return fetchApi<OnboardingPackData[]>(`/api/onboarding/packs?${params}`);
    },
    retry: 2,
  });
}

export function useOnboardingPack(id: string | null) {
  return useQuery<OnboardingPackData & { tasks: OnboardingTaskData[]; assignments: StaffOnboardingData[] }>({
    queryKey: ["onboarding-pack", id],
    queryFn: async () => {
      return fetchApi(`/api/onboarding/packs/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return mutateApi("/api/onboarding/packs", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      return mutateApi(`/api/onboarding/packs/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack-detail"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteOnboardingPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/onboarding/packs/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-packs"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useOnboardingAssignments(userId?: string) {
  return useQuery<StaffOnboardingData[]>({
    queryKey: ["onboarding-assignments", userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      return fetchApi<StaffOnboardingData[]>(`/api/onboarding/assign?${params}`);
    },
    retry: 2,
  });
}

export function useAssignOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; packId: string; dueDate?: string }) => {
      return mutateApi("/api/onboarding/assign", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateOnboardingProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { onboardingId: string; taskId: string; completed: boolean; notes?: string }) => {
      return mutateApi("/api/onboarding/assign", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-assignments"] });
      qc.invalidateQueries({ queryKey: ["onboarding-pack"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
