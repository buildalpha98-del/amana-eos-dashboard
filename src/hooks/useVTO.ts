"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    queryFn: async () => {
      const res = await fetch("/api/vto");
      if (!res.ok) throw new Error("Failed to fetch V/TO");
      return res.json();
    },
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
      const res = await fetch("/api/vto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update V/TO");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
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
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create goal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
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
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update goal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vto"] });
    },
  });
}
