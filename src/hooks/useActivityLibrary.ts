import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────

export interface ActivityTemplateFile {
  id: string;
  templateId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface ActivityTemplate {
  id: string;
  title: string;
  description: string | null;
  howTo: string | null;
  resourcesNeeded: string | null;
  category: string;
  ageGroup: string | null;
  durationMinutes: number | null;
  deleted: boolean;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  files: ActivityTemplateFile[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTemplateFilters {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateTemplateInput {
  title: string;
  description?: string | null;
  howTo?: string | null;
  resourcesNeeded?: string | null;
  category?: string;
  ageGroup?: string | null;
  durationMinutes?: number | null;
}

// ── Queries ───────────────────────────────────────────────────

export function useActivityTemplates(filters?: ActivityTemplateFilters) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));

  return useQuery<{ templates: ActivityTemplate[]; total: number; page: number; limit: number }>({
    queryKey: ["activity-templates", filters],
    queryFn: async () => {
      const res = await fetch(`/api/activity-templates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useActivityTemplate(id: string | null) {
  return useQuery<ActivityTemplate>({
    queryKey: ["activity-template", id],
    queryFn: async () => {
      const res = await fetch(`/api/activity-templates/${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!id,
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useCreateActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const res = await fetch("/api/activity-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create template");
      }
      return res.json() as Promise<ActivityTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
    },
  });
}

export function useUpdateActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: CreateTemplateInput & { id: string }) => {
      const res = await fetch(`/api/activity-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update template");
      }
      return res.json() as Promise<ActivityTemplate>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
      qc.invalidateQueries({ queryKey: ["activity-template", vars.id] });
    },
  });
}

export function useDeleteActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/activity-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
    },
  });
}

export function useUploadTemplateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, file }: { templateId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/activity-templates/${templateId}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload file");
      }
      return res.json() as Promise<ActivityTemplateFile>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
      qc.invalidateQueries({ queryKey: ["activity-template", vars.templateId] });
    },
  });
}

export function useDeleteTemplateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, fileId }: { templateId: string; fileId: string }) => {
      const res = await fetch(`/api/activity-templates/${templateId}/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete file");
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
      qc.invalidateQueries({ queryKey: ["activity-template", vars.templateId] });
    },
  });
}
