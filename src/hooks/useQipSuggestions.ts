"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface QipEvidenceRef {
  type: "reflection" | "observation";
  id: string;
  excerpt: string;
}

export interface QipSuggestionItem {
  id: string;
  qipId: string;
  qualityArea: number;
  field: "strengths" | "areasForImprovement" | "progressNotes" | "evidenceCollected";
  currentText: string | null;
  proposedText: string;
  rationale: string;
  evidenceRefs: QipEvidenceRef[];
  status: "pending" | "accepted" | "edited" | "rejected";
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  weekOf: string;
  createdAt: string;
}

interface Listing {
  suggestions: QipSuggestionItem[];
  count: number;
}

export function useQipSuggestions(
  qipId: string | undefined,
  status: "pending" | "all" = "pending",
) {
  return useQuery<Listing>({
    queryKey: ["qip-suggestions", qipId, status],
    queryFn: () =>
      fetchApi<Listing>(`/api/qip/${qipId}/suggestions?status=${status}`),
    enabled: !!qipId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface ReviewSuggestionArgs {
  suggestionId: string;
  action: "accept" | "edit" | "reject";
  text?: string;
}

export function useReviewQipSuggestion(qipId: string, serviceId: string) {
  const qc = useQueryClient();
  return useMutation<QipSuggestionItem, Error, ReviewSuggestionArgs>({
    mutationFn: ({ suggestionId, ...body }) =>
      mutateApi<QipSuggestionItem>(
        `/api/qip/${qipId}/suggestions/${suggestionId}`,
        { method: "PATCH", body },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["qip-suggestions", qipId] });
      qc.invalidateQueries({ queryKey: ["qip", serviceId] });
      toast({
        description:
          vars.action === "reject"
            ? "Suggestion rejected"
            : "Document updated — change is now live in the draft",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to review suggestion",
      });
    },
  });
}

export interface QipEvidenceItem {
  kind: "reflection" | "observation";
  id: string;
  title: string;
  excerpt: string;
  qualityAreas: number[];
  mtopOutcomes: string[];
  aiTagged: boolean;
  author: { id: string; name: string; avatar: string | null };
  childId?: string;
  createdAt: string;
}

export function useQipEvidence(
  serviceId: string | undefined,
  filters: { qa?: number; mtop?: string; from?: string; to?: string },
) {
  const qs = new URLSearchParams();
  if (filters.qa) qs.set("qa", String(filters.qa));
  if (filters.mtop) qs.set("mtop", filters.mtop);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);

  return useQuery<{ items: QipEvidenceItem[] }>({
    queryKey: [
      "qip-evidence",
      serviceId,
      filters.qa,
      filters.mtop,
      filters.from,
      filters.to,
    ],
    queryFn: () =>
      fetchApi<{ items: QipEvidenceItem[] }>(
        `/api/services/${serviceId}/qip-evidence?${qs.toString()}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}
