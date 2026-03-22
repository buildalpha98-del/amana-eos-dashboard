"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
    queryFn: () => fetchApi<ResponseTemplateData[]>("/api/response-templates"),
    retry: 2,
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
      return mutateApi("/api/response-templates", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteResponseTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/response-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
