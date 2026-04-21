"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RocksRollupService {
  serviceId: string;
  serviceName: string;
  total: number;
  onTrack: number;
}

export interface RocksRollup {
  quarter: string;
  total: number;
  onTrack: number;
  offTrack: number;
  complete: number;
  dropped: number;
  byService: RocksRollupService[];
}

export interface SentimentPoint {
  weekOf: string;
  avgMood: number;
  count: number;
}

export interface LeadershipOverview {
  staffCount: number;
  serviceCount: number;
  openIssueCount: number;
  openTicketCount: number;
  rocksRollup: RocksRollup;
  sentimentTrend: SentimentPoint[];
}

export function useLeadershipOverview() {
  return useQuery<LeadershipOverview>({
    queryKey: ["leadership-overview"],
    queryFn: () => fetchApi<LeadershipOverview>("/api/leadership/overview"),
    staleTime: 60_000,
    retry: 2,
  });
}
