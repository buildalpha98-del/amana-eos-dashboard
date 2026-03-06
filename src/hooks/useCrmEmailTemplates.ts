import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PipelineStage, LeadSource } from "@prisma/client";

export interface CrmEmailTemplateData {
  id: string;
  name: string;
  subject: string;
  body: string;
  triggerStage: PipelineStage | null;
  pipeline: LeadSource | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useCrmEmailTemplates() {
  return useQuery<CrmEmailTemplateData[]>({
    queryKey: ["crm-email-templates"],
    queryFn: async () => {
      const res = await fetch("/api/crm/email-templates");
      if (!res.ok) throw new Error("Failed to fetch email templates");
      return res.json();
    },
  });
}

export function useCreateCrmEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      subject: string;
      body: string;
      triggerStage?: string | null;
      pipeline?: string | null;
      sortOrder?: number;
    }) => {
      const res = await fetch("/api/crm/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
  });
}

export function useUpdateCrmEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      subject?: string;
      body?: string;
      triggerStage?: string | null;
      pipeline?: string | null;
      sortOrder?: number;
    }) => {
      const res = await fetch(`/api/crm/email-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
  });
}

export function useDeleteCrmEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/email-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
  });
}
