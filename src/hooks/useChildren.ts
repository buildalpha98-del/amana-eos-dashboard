"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";

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
    queryFn: async () => {
      const res = await fetch(`/api/children?${params}`);
      if (!res.ok) throw new Error("Failed to load children");
      return res.json();
    },
  });
}

export function useChild(id: string | null) {
  return useQuery<ChildRecord>({
    queryKey: ["child", id],
    queryFn: async () => {
      const res = await fetch(`/api/children/${id}`);
      if (!res.ok) throw new Error("Failed to load child");
      return res.json();
    },
    enabled: Boolean(id),
  });
}

export function useUpdateChild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; serviceId?: string }) => {
      const res = await fetch(`/api/children/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["children"] });
      queryClient.invalidateQueries({ queryKey: ["child"] });
      toast({ description: "Child record updated" });
    },
  });
}
