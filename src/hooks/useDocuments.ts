"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DocumentData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  centreId: string | null;
  centre: { id: string; name: string; code: string } | null;
  uploadedById: string;
  uploadedBy: { id: string; name: string; email: string };
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function useDocuments(filters?: {
  category?: string;
  centreId?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.centreId) params.set("centreId", filters.centreId);
  if (filters?.search) params.set("search", filters.search);
  const query = params.toString();

  return useQuery<DocumentData[]>({
    queryKey: ["documents", filters],
    queryFn: async () => {
      const res = await fetch(`/api/documents${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      category?: string;
      fileName: string;
      fileUrl: string;
      fileSize?: number;
      mimeType?: string;
      centreId?: string | null;
      tags?: string[];
    }) => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
