"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface RollupService {
  id: string;
  name: string;
  code: string;
}

export interface RollupCell {
  value: number | null;
  onTrack: boolean | null;
}

export interface RollupRow {
  title: string;
  unit: string | null;
  goalDirection: "above" | "below" | "exact";
  goalValue: number;
  byService: Record<string, RollupCell>;
}

export interface ScorecardRollup {
  services: RollupService[];
  rows: RollupRow[];
}

export function useScorecardRollup(enabled: boolean) {
  return useQuery<ScorecardRollup>({
    queryKey: ["scorecard-rollup"],
    queryFn: () => fetchApi<ScorecardRollup>("/api/scorecard/rollup"),
    staleTime: 60_000,
    retry: 2,
    enabled,
  });
}
