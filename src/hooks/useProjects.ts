"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  service: {
    id: string;
    name: string;
    code: string;
  } | null;
  template: {
    id: string;
    name: string;
  } | null;
  _count: {
    todos: number;
  };
  progress: {
    total: number;
    completed: number;
    percent: number;
  };
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  service: {
    id: string;
    name: string;
    code: string;
  } | null;
  template: {
    id: string;
    name: string;
  } | null;
  todos: {
    id: string;
    title: string;
    status: string;
    dueDate: string;
    assignee: { id: string; name: string };
  }[];
}

export function useProjects(filters?: {
  status?: string;
  serviceId?: string;
  ownerId?: string;
}) {
  return useQuery<ProjectSummary[]>({
    queryKey: ["projects", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.ownerId) params.set("ownerId", filters.ownerId);
      return fetchApi<ProjectSummary[]>(`/api/projects?${params}`);
    },
    retry: 2,
  });
}

export function useProject(id: string) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", id],
    queryFn: () => fetchApi<ProjectDetail>(`/api/projects/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      serviceId?: string | null;
      templateId?: string | null;
      ownerId: string;
      startDate?: string | null;
      targetDate?: string | null;
    }) => {
      return mutateApi("/api/projects", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ description: "Project created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string | null;
      status?: string;
      ownerId?: string;
      serviceId?: string | null;
      startDate?: string | null;
      targetDate?: string | null;
    }) => {
      return mutateApi(`/api/projects/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/projects/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ description: "Project deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
