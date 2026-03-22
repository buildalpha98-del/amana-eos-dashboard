"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
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
    queryFn: () => fetchApi<TodoTemplateData[]>("/api/todo-templates"),
    retry: 2,
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
      return mutateApi("/api/todo-templates", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi(`/api/todo-templates/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/todo-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todo-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
