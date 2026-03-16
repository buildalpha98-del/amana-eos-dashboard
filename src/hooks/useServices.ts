"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ServiceSummary {
  id: string;
  name: string;
  code: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  managerId: string | null;
  manager: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  } | null;
  capacity: number | null;
  operatingDays: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    todos: number;
    issues: number;
    projects: number;
  };
}

export interface ServiceDetail extends Omit<ServiceSummary, "_count"> {
  bscDailyRate: number | null;
  ascDailyRate: number | null;
  vcDailyRate: number | null;
  bscCasualRate: number;
  ascCasualRate: number;
  bscGroceryRate: number;
  ascGroceryRate: number;
  vcGroceryRate: number;
  todos: {
    id: string;
    title: string;
    status: string;
    dueDate: string;
    assignee: { id: string; name: string };
  }[];
  issues: {
    id: string;
    title: string;
    status: string;
    priority: string;
    owner: { id: string; name: string } | null;
  }[];
  projects: {
    id: string;
    name: string;
    status: string;
    owner: { id: string; name: string };
    _count: { todos: number };
  }[];
}

export function useServices(status?: string) {
  return useQuery<ServiceSummary[]>({
    queryKey: ["services", status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/services?${params}`);
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
    staleTime: 5 * 60_000, // Reference data: 5 min stale time
  });
}

export function useService(id: string) {
  return useQuery<ServiceDetail>({
    queryKey: ["service", id],
    queryFn: async () => {
      const res = await fetch(`/api/services/${id}`);
      if (!res.ok) throw new Error("Failed to fetch service");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      code: string;
      address?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      phone?: string;
      email?: string;
      managerId?: string | null;
      capacity?: number | null;
      operatingDays?: string;
      notes?: string;
    }) => {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create service");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      code?: string;
      address?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      phone?: string;
      email?: string;
      status?: string;
      managerId?: string | null;
      capacity?: number | null;
      operatingDays?: string;
      notes?: string;
      bscDailyRate?: number | null;
      ascDailyRate?: number | null;
      vcDailyRate?: number | null;
      bscCasualRate?: number;
      ascCasualRate?: number;
      bscGroceryRate?: number;
      ascGroceryRate?: number;
      vcGroceryRate?: number;
    }) => {
      const res = await fetch(`/api/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update service");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service", vars.id] });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete service");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
