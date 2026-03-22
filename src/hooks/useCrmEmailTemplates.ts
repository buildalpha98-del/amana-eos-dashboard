import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
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
    queryFn: () => fetchApi<CrmEmailTemplateData[]>("/api/crm/email-templates"),
    retry: 2,
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
    }) => mutateApi("/api/crm/email-templates", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
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
    }) => mutateApi(`/api/crm/email-templates/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteCrmEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/crm/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-email-templates"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
