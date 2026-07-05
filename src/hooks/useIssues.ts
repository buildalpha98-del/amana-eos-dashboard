"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { IssueStatus, IssuePriority, IssueCategory } from "@prisma/client";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface IssueUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface IssueData {
  id: string;
  title: string;
  description: string | null;
  raisedById: string;
  raisedBy: IssueUser;
  ownerId: string | null;
  owner: IssueUser | null;
  rockId: string | null;
  rock: { id: string; title: string } | null;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  priority: IssuePriority;
  status: IssueStatus;
  category: IssueCategory;
  identifiedAt: string;
  discussedAt: string | null;
  solvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { spawnedTodos: number };
}

export interface IssueDetail extends IssueData {
  spawnedTodos: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; name: string };
  }[];
}

export function useIssues(filters?: {
  status?: string;
  priority?: string;
  ownerId?: string;
  rockId?: string;
  serviceId?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.ownerId) params.set("ownerId", filters.ownerId);
  if (filters?.rockId) params.set("rockId", filters.rockId);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.category) params.set("category", filters.category);

  const query = params.toString();

  return useQuery<IssueData[]>({
    queryKey: ["issues", filters?.status, filters?.priority, filters?.ownerId, filters?.rockId, filters?.serviceId, filters?.category],
    queryFn: () => fetchApi<IssueData[]>(`/api/issues${query ? `?${query}` : ""}`),
    staleTime: 30_000,
    retry: 2,
  });
}

export function useIssue(id: string) {
  return useQuery<IssueDetail>({
    staleTime: 30_000,
    queryKey: ["issue", id],
    queryFn: () => fetchApi<IssueDetail>(`/api/issues/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId?: string | null;
      rockId?: string | null;
      serviceId?: string | null;
      priority?: IssuePriority;
      category?: IssueCategory;
    }) => {
      return mutateApi<IssueData>("/api/issues", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast({ description: "Issue created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      ownerId?: string | null;
      status?: IssueStatus;
      priority?: IssuePriority;
      rockId?: string | null;
      resolution?: string | null;
      category?: IssueCategory;
    }) => {
      return mutateApi<IssueData>(`/api/issues/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onMutate: async (vars) => {
      if (!vars.status) return;
      await queryClient.cancelQueries({ queryKey: ["issues"] });
      const queries = queryClient.getQueriesData<IssueData[]>({ queryKey: ["issues"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<IssueData[]>(key,
          data.map((i) => (i.id === vars.id ? { ...i, ...vars } : i)),
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
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issue"] });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/issues/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast({ description: "Issue deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useBulkIssueAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      action: "resolve" | "delete" | "assign" | "move";
      ids: string[];
      assigneeId?: string;
      category?: string;
    }) => {
      return mutateApi("/api/issues/bulk", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issue"] });
      const labels: Record<string, string> = {
        resolve: "resolved",
        delete: "deleted",
        assign: "reassigned",
        move: "moved",
      };
      toast({ description: `${vars.ids.length} issue(s) ${labels[vars.action]}` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function usePromoteIssueToRock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      quarter?: string;
      ownerId?: string | null;
      rockType?: "company" | "personal";
    }) => {
      return mutateApi<{ rock: { id: string; title: string }; issue: IssueData }>(
        `/api/issues/${id}/promote-to-rock`,
        { method: "POST", body },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issue"] });
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      queryClient.invalidateQueries({ queryKey: ["rocks-list-active"] });
      toast({ description: "Promoted to a Rock" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
