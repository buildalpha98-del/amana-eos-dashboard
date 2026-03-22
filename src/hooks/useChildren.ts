"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface ChildRecord {
  id: string;
  enrolmentId: string;
  serviceId: string | null;
  firstName: string;
  surname: string;
  dob: string | null;
  gender: string | null;
  address: { street?: string; suburb?: string; state?: string; postcode?: string } | null;
  culturalBackground: string[];
  schoolName: string | null;
  yearLevel: string | null;
  crn: string | null;
  medical: Record<string, unknown> | null;
  dietary: Record<string, unknown> | null;
  bookingPrefs: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string; code: string } | null;
  enrolment: {
    id: string;
    primaryParent: {
      firstName: string;
      surname: string;
      email: string;
      mobile: string;
      [key: string]: unknown;
    };
    status: string;
    createdAt: string;
  };
}

interface ChildrenResponse {
  children: ChildRecord[];
  total: number;
}

export function useChildren(filters?: { status?: string; serviceId?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.search) params.set("search", filters.search);
  params.set("limit", "200");

  return useQuery<ChildrenResponse>({
    queryKey: ["children", filters?.status || "all", filters?.serviceId || "", filters?.search || ""],
    queryFn: () => fetchApi<ChildrenResponse>(`/api/children?${params}`),
    retry: 2,
  });
}

export function useChild(id: string | null) {
  return useQuery<ChildRecord>({
    queryKey: ["child", id],
    queryFn: () => fetchApi<ChildRecord>(`/api/children/${id}`),
    enabled: Boolean(id),
    retry: 2,
  });
}

export function useUpdateChild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; serviceId?: string }) => {
      return mutateApi<ChildRecord>(`/api/children/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      queryClient.invalidateQueries({ queryKey: ["child"] });
      toast({ description: "Child record updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
