import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface FeedbackAuthor {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface InternalFeedback {
  id: string;
  category: "bug" | "feature_request" | "question" | "general";
  message: string;
  screenshotUrl: string | null;
  page: string | null;
  status: "new" | "acknowledged" | "in_progress" | "resolved";
  resolvedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  author: FeedbackAuthor;
}

export interface FeedbackListResponse {
  feedback: InternalFeedback[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FeedbackFilters {
  status?: string;
  category?: string;
  page?: number;
}

function buildQueryString(filters: FeedbackFilters) {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.category) p.set("category", filters.category);
  if (filters.page) p.set("page", String(filters.page));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useFeedbackList(filters: FeedbackFilters) {
  return useQuery<FeedbackListResponse>({
    queryKey: ["internal-feedback", "list", filters.status, filters.category, filters.page ?? 1],
    queryFn: () => fetchApi<FeedbackListResponse>(`/api/internal-feedback${buildQueryString(filters)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useFeedback(id: string | null) {
  return useQuery<{ feedback: InternalFeedback }>({
    queryKey: ["internal-feedback", "detail", id],
    queryFn: () => fetchApi<{ feedback: InternalFeedback }>(`/api/internal-feedback/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status?: string; adminNotes?: string }) =>
      mutateApi<{ feedback: InternalFeedback }>(`/api/internal-feedback/${args.id}`, {
        method: "PATCH",
        body: { status: args.status, adminNotes: args.adminNotes },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-feedback"] });
    },
  });
}
