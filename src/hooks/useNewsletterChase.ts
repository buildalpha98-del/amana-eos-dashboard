import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ChaseEntryView {
  serviceId: string;
  serviceName: string;
  skipped: boolean;
  skipReason: string | null;
  alreadySent?: boolean;
}

export interface ChaseEligibility {
  eligible: boolean;
  currentTerm: { year: number; number: 1 | 2 | 3 | 4 } | null;
  nextTerm: { year: number; number: 1 | 2 | 3 | 4 } | null;
  weeksUntilTermEnd: number | null;
}

export interface ChaseDraftView {
  id: string;
  title: string;
  content: string;
  targetId: string;
  createdAt: string;
  metadata: {
    nextTerm?: { year: number; number: number };
    currentTerm?: { year: number; number: number };
    weeksUntilTermEnd?: number;
  };
  entries: ChaseEntryView[];
}

export interface ChaseCurrentResponse {
  draft: ChaseDraftView | null;
  eligibility: ChaseEligibility;
}

const KEY = "newsletter-chase-current";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useChaseCurrent() {
  return useQuery<ChaseCurrentResponse>({
    queryKey: [KEY],
    queryFn: () => fetchApi<ChaseCurrentResponse>("/api/marketing/newsletter-chase/current"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useMarkChaseSent() {
  const qc = useQueryClient();
  return useMutation<
    { schoolCommId: string; sentAt: string | null; year: number | null; term: number | null },
    Error,
    { serviceId: string; subject: string; body: string; contactName?: string; contactEmail?: string; termYear?: number; termNumber?: number }
  >({
    mutationFn: ({ serviceId, ...payload }) =>
      mutateApi(`/api/marketing/newsletter-chase/${serviceId}/mark-sent`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: destructive,
  });
}
