"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { GoalStatus } from "@prisma/client";

export interface GoalRock {
  id: string;
  title: string;
  status: string;
  percentComplete: number;
}

export interface OneYearGoal {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: GoalStatus;
  vtoId: string;
  rocks: GoalRock[];
  createdAt: string;
  updatedAt: string;
}

export interface VTOData {
  id: string;
  coreValues: string[];
  corePurpose: string | null;
  coreNiche: string | null;
  tenYearTarget: string | null;
  threeYearPicture: string | null;
  marketingStrategy: string | null;
  sectionLabels: Record<string, string> | null;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
  oneYearGoals: OneYearGoal[];
}

export function useVTO() {
  return useQuery<VTOData>({
    queryKey: ["vto"],
    queryFn: () => fetchApi<VTOData>("/api/vto"),
    retry: 2,
  });
}

export function useUpdateVTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: Partial<{
        coreValues: string[];
        corePurpose: string;
        coreNiche: string;
        tenYearTarget: string;
        threeYearPicture: string;
        marketingStrategy: string;
        sectionLabels: Record<string, string>;
      }>
    ) => {
      return mutateApi("/api/vto", { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      targetDate?: string;
      vtoId: string;
    }) => {
      return mutateApi("/api/goals", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      status?: GoalStatus;
      targetDate?: string | null;
    }) => {
      return mutateApi(`/api/goals/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/goals/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
