"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface AdminAiDraftRow {
  id: string;
  todoId: string | null;
  marketingTaskId: string | null;
  coworkTodoId: string | null;
  ticketId: string | null;
  issueId: string | null;
  taskType: "communication" | "research" | "document" | "admin";
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  status: "ready" | "accepted" | "edited" | "dismissed";
  tokensUsed: number;
  model: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  todo: {
    id: string;
    title: string;
    assignee: { id: string; name: string | null } | null;
  } | null;
  marketingTask: {
    id: string;
    title: string;
    assignee: { id: string; name: string | null } | null;
  } | null;
  coworkTodo: {
    id: string;
    title: string;
    assignedTo: { id: string; name: string | null } | null;
  } | null;
  ticket: {
    id: string;
    ticketNumber: number;
    subject: string | null;
    assignedTo: { id: string; name: string | null } | null;
  } | null;
  issue: {
    id: string;
    title: string;
    owner: { id: string; name: string | null } | null;
  } | null;
}

export interface AdminAiDraftsResponse {
  drafts: AdminAiDraftRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminAiDraftsFilters {
  status?: string;
  taskType?: string;
  sourceType?: string;
  page?: number;
}

function qs(f: AdminAiDraftsFilters) {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.taskType) p.set("taskType", f.taskType);
  if (f.sourceType) p.set("sourceType", f.sourceType);
  if (f.page) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useAdminAiDrafts(filters: AdminAiDraftsFilters) {
  return useQuery<AdminAiDraftsResponse>({
    queryKey: [
      "ai-drafts",
      "admin",
      filters.status ?? "ready",
      filters.taskType,
      filters.sourceType,
      filters.page ?? 1,
    ],
    queryFn: () =>
      fetchApi<AdminAiDraftsResponse>(`/api/ai-drafts/admin${qs(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useBulkDraftAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { action: "approve" | "dismiss"; ids: string[] }) =>
      mutateApi<{ updated: number }>("/api/ai-drafts/bulk", {
        method: "POST",
        body: args,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-drafts"] }),
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Bulk action failed",
      });
    },
  });
}
