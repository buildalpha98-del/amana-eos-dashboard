"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
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
    }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
