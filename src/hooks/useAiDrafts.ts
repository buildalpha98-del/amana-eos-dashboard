"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AiDraftStatus = "ready" | "accepted" | "edited" | "dismissed";
export type AiDraftTaskType = "communication" | "research" | "document" | "admin";

export interface AiDraftData {
  id: string;
  todoId: string | null;
  marketingTaskId: string | null;
  coworkTodoId: string | null;
  ticketId: string | null;
  issueId: string | null;
  taskType: AiDraftTaskType;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  status: AiDraftStatus;
  tokensUsed: number;
  model: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  // Linked source summaries
  todo: { id: string; title: string; status: string; dueDate: string } | null;
  marketingTask: { id: string; title: string; status: string; dueDate: string | null } | null;
  coworkTodo: { id: string; title: string; completed: boolean; date: string } | null;
  ticket: { id: string; ticketNumber: number; subject: string | null; status: string } | null;
  issue: { id: string; title: string; status: string; priority: string } | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch AI drafts for the current user, optionally filtered by status. */
export function useAiDrafts(status?: AiDraftStatus) {
  const url = status ? `/api/ai-drafts?status=${status}` : "/api/ai-drafts";

  return useQuery<AiDraftData[]>({
    queryKey: ["ai-drafts", status ?? "all"],
    queryFn: () => fetchApi<AiDraftData[]>(url),
    staleTime: 30_000,
    retry: 2,
  });
}

/** Lightweight query returning just the count of "ready" drafts for badge display. */
export function useAiDraftCount() {
  return useQuery<number>({
    queryKey: ["ai-drafts", "count"],
    queryFn: async () => {
      const res = await fetchApi<{ count: number }>("/api/ai-drafts?status=ready&countOnly=true");
      return res.count;
    },
    staleTime: 30_000,
    retry: 2,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Review (accept / edit / dismiss) an AI draft. */
export function useReviewDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      editedContent,
    }: {
      id: string;
      status: "accepted" | "edited" | "dismissed";
      editedContent?: string;
    }) => {
      return mutateApi<AiDraftData>(`/api/ai-drafts/${id}`, {
        method: "PATCH",
        body: { status, editedContent },
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ai-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      const labels: Record<string, string> = {
        accepted: "Draft accepted and task completed",
        edited: "Draft updated",
        dismissed: "Draft dismissed",
      };
      toast({ description: labels[vars.status] ?? "Draft updated" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}
