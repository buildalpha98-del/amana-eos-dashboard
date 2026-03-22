"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ContactData {
  id: string;
  waId: string;
  phoneNumber: string;
  name: string | null;
  parentName: string | null;
  childName: string | null;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { tickets: number };
}

export function useContacts() {
  return useQuery<ContactData[]>({
    queryKey: ["contacts"],
    queryFn: () => fetchApi<ContactData[]>("/api/contacts"),
    retry: 2,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      waId: string;
      phoneNumber: string;
      name?: string | null;
      parentName?: string | null;
      childName?: string | null;
      serviceId?: string | null;
    }) => mutateApi<ContactData>("/api/contacts", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
