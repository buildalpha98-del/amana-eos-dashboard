"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RockStatus, RockPriority } from "@prisma/client";

export interface RockOwner {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface RockData {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: RockOwner;
  quarter: string;
  status: RockStatus;
  percentComplete: number;
  priority: RockPriority;
  oneYearGoalId: string | null;
  oneYearGoal: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { todos: number; issues: number; milestones: number };
}

export function useRocks(quarter?: string) {
  return useQuery<RockData[]>({
    queryKey: ["rocks", quarter],
    queryFn: async () => {
      const params = quarter ? `?quarter=${quarter}` : "";
      const res = await fetch(`/api/rocks${params}`);
      if (!res.ok) throw new Error("Failed to fetch rocks");
      return res.json();
    },
  });
}

export function useRock(id: string) {
  return useQuery({
    queryKey: ["rock", id],
    queryFn: async () => {
      const res = await fetch(`/api/rocks/${id}`);
      if (!res.ok) throw new Error("Failed to fetch rock");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId: string;
      quarter: string;
      priority?: RockPriority;
      oneYearGoalId?: string | null;
    }) => {
      const res = await fetch("/api/rocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create rock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
    },
  });
}

export function useUpdateRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      ownerId?: string;
      status?: RockStatus;
      percentComplete?: number;
      priority?: RockPriority;
      oneYearGoalId?: string | null;
    }) => {
      const res = await fetch(`/api/rocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update rock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      queryClient.invalidateQueries({ queryKey: ["rock"] });
    },
  });
}

export function useDeleteRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rocks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rock");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
    },
  });
}
