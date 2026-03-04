"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RecurrenceRule } from "@prisma/client";

export interface TemplateAssignee {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface TemplateService {
  id: string;
  name: string;
  code: string;
}

export interface TodoTemplateData {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assignee: TemplateAssignee;
  serviceId: string | null;
  service: TemplateService | null;
  recurrence: RecurrenceRule;
  nextRunAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useTodoTemplates() {
  return useQuery<TodoTemplateData[]>({
    queryKey: ["todo-templates"],
    queryFn: async () => {
      const res = await fetch("/api/todo-templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      assigneeId: string;
      serviceId?: string | null;
      recurrence: RecurrenceRule;
      nextRunAt: string;
    }) => {
      const res = await fetch("/api/todo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
  });
}

export function useUpdateTemplate() {
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
      serviceId?: string | null;
      recurrence?: RecurrenceRule;
      nextRunAt?: string;
      isActive?: boolean;
    }) => {
      const res = await fetch(`/api/todo-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/todo-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
  });
}
