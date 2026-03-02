"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TodoStatus } from "@prisma/client";

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
  dueDate: string;
  weekOf: string;
  status: TodoStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    queryKey: ["todos", filters],
    queryFn: async () => {
      const res = await fetch(`/api/todos${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch todos");
      return res.json();
    },
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      assigneeId: string;
      rockId?: string | null;
      issueId?: string | null;
      dueDate: string;
      weekOf: string;
    }) => {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create todo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
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
    }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update todo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete todo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}
