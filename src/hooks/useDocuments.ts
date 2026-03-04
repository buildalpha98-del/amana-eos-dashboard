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
  folderId: string | null;
  folder: { id: string; name: string } | null;
  uploadedById: string;
  uploadedBy: { id: string; name: string; email: string };
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  parentId: string | null;
  _count: { documents: number; children: number };
  createdAt: string;
  updatedAt: string;
}

export interface DocumentsResponse {
  documents: DocumentData[];
  total: number;
  page: number;
  totalPages: number;
}

export function useDocuments(filters?: {
  category?: string;
  centreId?: string;
  folderId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.centreId) params.set("centreId", filters.centreId);
  if (filters?.folderId) params.set("folderId", filters.folderId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const query = params.toString();

  return useQuery<DocumentsResponse>({
    queryKey: ["documents", filters],
    queryFn: async () => {
      const res = await fetch(`/api/documents${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });
}

export function useDocumentFolders() {
  return useQuery<DocumentFolder[]>({
    queryKey: ["document-folders"],
    queryFn: async () => {
      const res = await fetch("/api/document-folders");
      if (!res.ok) throw new Error("Failed to fetch folders");
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
      folderId?: string | null;
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
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; parentId?: string | null }) => {
      const res = await fetch("/api/document-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create folder");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/document-folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename folder");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/document-folders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete folder");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      category?: string | null;
      tags?: string[];
      centreId?: string | null;
    }) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useMoveDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error("Failed to move document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
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
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
  });
}
