"use client";

/**
 * useRecentIncidents — top-N most leadership-relevant incidents
 * across the caller's visible services. Powers the leadership-page
 * widget that replaces the cross-service `/incidents` triage surface
 * (per the deprecation plan in next-priorities.md Tier 1).
 *
 * 2026-05-04: introduced.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RecentIncident {
  id: string;
  serviceId: string;
  service: { id: string; name: string; code: string };
  incidentDate: string;
  childName: string | null;
  incidentType: string;
  severity: string;
  location: string | null;
  description: string;
  parentNotified: boolean;
  reportableToAuthority: boolean;
  followUpRequired: boolean;
}

export interface RecentIncidentsResponse {
  incidents: RecentIncident[];
  windowDays: number;
  asOf: string;
}

interface UseRecentIncidentsOpts {
  limit?: number;
  days?: number;
}

export function useRecentIncidents(opts: UseRecentIncidentsOpts = {}) {
  const { limit = 5, days = 14 } = opts;
  return useQuery<RecentIncidentsResponse>({
    queryKey: ["recent-incidents", limit, days],
    queryFn: () =>
      fetchApi<RecentIncidentsResponse>(
        `/api/incidents/recent?limit=${limit}&days=${days}`,
      ),
    retry: 2,
    // Incidents are infrequent — once-per-5-minutes refresh keeps the
    // widget fresh enough for triage without hammering the route.
    staleTime: 5 * 60_000,
  });
}
