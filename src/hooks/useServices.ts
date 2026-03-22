"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

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
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();

  return useQuery<ServiceSummary[]>({
    queryKey: ["services", status],
    queryFn: () => fetchApi<ServiceSummary[]>(`/api/services${qs ? `?${qs}` : ""}`),
    staleTime: 5 * 60_000, // Reference data: 5 min stale time
    retry: 2,
  });
}

export function useService(id: string) {
  return useQuery<ServiceDetail>({
    queryKey: ["service", id],
    queryFn: () => fetchApi<ServiceDetail>(`/api/services/${id}`),
    enabled: !!id,
    refetchInterval: 5 * 60_000, // Auto-refetch every 5 min for stale data
    retry: 2,
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
      return mutateApi<ServiceSummary>("/api/services", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
      return mutateApi<ServiceDetail>(`/api/services/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service", vars.id] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/services/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
