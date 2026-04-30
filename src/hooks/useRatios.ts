"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export type SessionTypeKey = "bsc" | "asc" | "vc";

export interface RatioLive {
  serviceId: string;
  sessionType: SessionTypeKey;
  educatorCount: number;
  educatorIds: string[];
  childCount: number;
  ratioText: string;
  belowRatio: boolean;
  minRatio: string;
  notes: string;
  capturedAt: string;
}

export interface RatioSnapshotRow {
  id: string;
  serviceId: string;
  date: string;
  sessionType: SessionTypeKey;
  capturedAt: string;
  educatorCount: number;
  childCount: number;
  ratioText: string;
  belowRatio: boolean;
  educatorIds: string[];
  notes: string | null;
}

export function useRatios(
  serviceId: string | undefined,
  filters?: { date?: string; sessionType?: SessionTypeKey },
) {
  const qs = new URLSearchParams();
  if (filters?.date) qs.set("date", filters.date);
  if (filters?.sessionType) qs.set("sessionType", filters.sessionType);
  return useQuery<{ live: RatioLive[]; snapshots: RatioSnapshotRow[] }>({
    queryKey: ["ratios", serviceId, filters?.date, filters?.sessionType],
    queryFn: () =>
      fetchApi<{ live: RatioLive[]; snapshots: RatioSnapshotRow[] }>(
        `/api/services/${serviceId}/ratios?${qs.toString()}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
