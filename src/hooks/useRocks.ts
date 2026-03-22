"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RockStatus, RockPriority, RockType } from "@prisma/client";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

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
  rockType: RockType;
  oneYearGoalId: string | null;
  oneYearGoal: { id: string; title: string } | null;
  serviceId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { todos: number; issues: number; milestones: number };
}

export function useRocks(quarter?: string, rockType?: string) {
  return useQuery<RockData[]>({
    queryKey: ["rocks", quarter, rockType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (quarter) params.set("quarter", quarter);
      if (rockType) params.set("rockType", rockType);
      const qs = params.toString();
      return fetchApi<RockData[]>(`/api/rocks${qs ? `?${qs}` : ""}`);
    },
    staleTime: 30_000,
    retry: 2,
  });
}

export interface RockMilestone {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
}

export interface RockDetail extends Omit<RockData, "_count"> {
  milestones: RockMilestone[];
  todos: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueDate: string | null;
    assigneeId: string | null;
    assignee: RockOwner | null;
    createdAt: string;
  }[];
  issues: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    owner: RockOwner | null;
    createdAt: string;
  }[];
}

export function useRock(id: string) {
  return useQuery<RockDetail>({
    queryKey: ["rock", id],
    queryFn: () => fetchApi<RockDetail>(`/api/rocks/${id}`),
    enabled: !!id,
    staleTime: 30_000,
    retry: 2,
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
      rockType?: RockType;
      oneYearGoalId?: string | null;
    }) => {
      return mutateApi<RockData>("/api/rocks", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      toast({ description: "Rock created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      rockType?: RockType;
      oneYearGoalId?: string | null;
    }) => {
      return mutateApi<RockData>(`/api/rocks/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["rocks"] });
      const queries = queryClient.getQueriesData<RockData[]>({ queryKey: ["rocks"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<RockData[]>(key,
          data.map((r) => (r.id === vars.id ? { ...r, ...vars } : r)),
        );
      }
      return { queries };
    },
    onError: (_err: Error, _vars, ctx) => {
      if (ctx?.queries) {
        for (const [key, data] of ctx.queries) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({ variant: "destructive", description: _err.message || "Something went wrong" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      queryClient.invalidateQueries({ queryKey: ["rock"] });
    },
  });
}

export function useDeleteRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/rocks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      toast({ description: "Rock deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
