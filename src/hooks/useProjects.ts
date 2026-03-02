"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.ownerId) params.set("ownerId", filters.ownerId);
      const res = await fetch(`/api/projects?${params}`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });
}

export function useProject(id: string) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
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
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update project");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
