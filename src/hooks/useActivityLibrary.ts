import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
    queryFn: () => fetchApi(`/api/activity-templates?${params}`),
    retry: 2,
  });
}

export function useActivityTemplate(id: string | null) {
  return useQuery<ActivityTemplate>({
    queryKey: ["activity-template", id],
    queryFn: () => fetchApi<ActivityTemplate>(`/api/activity-templates/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useCreateActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      return mutateApi<ActivityTemplate>("/api/activity-templates", { method: "POST", body: input });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: CreateTemplateInput & { id: string }) => {
      return mutateApi<ActivityTemplate>(`/api/activity-templates/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
      qc.invalidateQueries({ queryKey: ["activity-template", vars.id] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteActivityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/activity-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// FormData upload — keep raw fetch (mutateApi sets Content-Type to application/json)
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
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteTemplateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, fileId }: { templateId: string; fileId: string }) => {
      return mutateApi(`/api/activity-templates/${templateId}/files/${fileId}`, { method: "DELETE" });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["activity-templates"] });
      qc.invalidateQueries({ queryKey: ["activity-template", vars.templateId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
