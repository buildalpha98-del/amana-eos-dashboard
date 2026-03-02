"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ResponseTemplateData {
  id: string;
  title: string;
  body: string;
  category: string | null;
  shortcut: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useResponseTemplates() {
  return useQuery<ResponseTemplateData[]>({
    queryKey: ["response-templates"],
    queryFn: async () => {
      const res = await fetch("/api/response-templates");
      if (!res.ok) throw new Error("Failed to fetch response templates");
      return res.json();
    },
  });
}

export function useCreateResponseTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      body: string;
      category?: string | null;
      shortcut?: string | null;
    }) => {
      const res = await fetch("/api/response-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create response template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
  });
}

export function useDeleteResponseTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/response-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
  });
}
