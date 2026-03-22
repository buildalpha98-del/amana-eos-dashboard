"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface TemplateTask {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  sortOrder: number;
  defaultDays: number | null;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tasks: TemplateTask[];
  _count: {
    projects: number;
  };
  createdAt: string;
}

export function useProjectTemplates() {
  return useQuery<ProjectTemplate[]>({
    queryKey: ["project-templates"],
    queryFn: () => fetchApi<ProjectTemplate[]>("/api/project-templates"),
    retry: 2,
  });
}

export function useCreateProjectTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      category?: string;
      tasks?: {
        title: string;
        description?: string;
        category?: string;
        sortOrder?: number;
        defaultDays?: number;
      }[];
    }) => {
      return mutateApi("/api/project-templates", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteProjectTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/project-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
