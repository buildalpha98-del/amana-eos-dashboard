"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TodoStatus } from "@prisma/client";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface TodoAssignee {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface TodoData {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assignee: TodoAssignee;
  rockId: string | null;
  rock: { id: string; title: string } | null;
  issueId: string | null;
  issue: { id: string; title: string } | null;
  serviceId: string | null;
  isPrivate: boolean;
  dueDate: string;
  weekOf: string;
  status: TodoStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  aiDraftId: string | null;
  aiDraftStatus: string | null;
}

export function useTodos(filters?: {
  weekOf?: string;
  assigneeId?: string;
  status?: string;
  rockId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.weekOf) params.set("weekOf", filters.weekOf);
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.rockId) params.set("rockId", filters.rockId);

  const query = params.toString();

  return useQuery<TodoData[]>({
    queryKey: ["todos", filters?.weekOf, filters?.assigneeId, filters?.status, filters?.rockId],
    queryFn: () => fetchApi<TodoData[]>(`/api/todos${query ? `?${query}` : ""}`),
    staleTime: 30_000,
    retry: 2,
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      assigneeId: string;
      assigneeIds?: string[];
      rockId?: string | null;
      issueId?: string | null;
      serviceId?: string | null;
      isPrivate?: boolean;
      dueDate: string;
      weekOf: string;
    }) => {
      return mutateApi<TodoData>("/api/todos", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ description: "To-do created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      assigneeId?: string;
      status?: TodoStatus;
      dueDate?: string;
      weekOf?: string;
      rockId?: string | null;
      issueId?: string | null;
      isPrivate?: boolean;
    }) => {
      return mutateApi<TodoData>(`/api/todos/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onMutate: async (vars) => {
      // Optimistic update for status toggle
      if (!vars.status) return;
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const queries = queryClient.getQueriesData<TodoData[]>({ queryKey: ["todos"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<TodoData[]>(key,
          data.map((t) =>
            t.id === vars.id
              ? { ...t, status: vars.status!, completedAt: vars.status === "complete" ? new Date().toISOString() : null }
              : t
          ),
        );
      }
      return { queries };
    },
    onError: (_err: Error, _vars, ctx) => {
      // Rollback on error
      if (ctx?.queries) {
        for (const [key, data] of ctx.queries) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({ variant: "destructive", description: _err.message || "Something went wrong" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/todos/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast({ description: "To-do deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useBulkTodoAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      action: "complete" | "delete" | "assign";
      ids: string[];
      assigneeId?: string;
    }) => {
      return mutateApi("/api/todos/bulk-actions", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      const count = vars.ids.length;
      switch (vars.action) {
        case "complete":
          toast({ description: `${count} to-do${count !== 1 ? "s" : ""} marked complete` });
          break;
        case "delete":
          toast({ description: `${count} to-do${count !== 1 ? "s" : ""} deleted` });
          break;
        case "assign":
          toast({ description: `${count} to-do${count !== 1 ? "s" : ""} reassigned` });
          break;
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Bulk action failed" });
    },
  });
}
