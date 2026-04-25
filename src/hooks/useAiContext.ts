"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface ReflectionAiContext {
  serviceName: string;
  weekSummary: string;
  recentObservations: string;
  recentIncidents: string;
  recentAudits: string;
}

/**
 * Fetches pre-formatted context strings for the `nqs/reflection-draft`
 * AI template. The hook is lazy — pass `enabled: false` if the dialog
 * isn't open yet, to avoid refetching on every keystroke.
 *
 * Cache is generous (5 minutes) — the underlying observations / incidents
 * / audits don't change frequently enough to justify shorter staleness.
 */
export function useReflectionAiContext(
  serviceId: string | undefined,
  enabled = true,
) {
  return useQuery<ReflectionAiContext>({
    queryKey: ["ai-context", "reflection", serviceId],
    queryFn: () =>
      fetchApi<ReflectionAiContext>(
        `/api/services/${serviceId}/ai-context/reflection`,
      ),
    enabled: enabled && !!serviceId,
    retry: 2,
    staleTime: 5 * 60_000,
  });
}
