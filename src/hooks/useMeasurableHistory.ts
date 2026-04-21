"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface MeasurableHistoryEntry {
  weekOf: string;
  value: number;
  onTrack: boolean;
}

export interface MeasurableHistory {
  measurable: {
    id: string;
    title: string;
    goalDirection: "above" | "below" | "exact";
    goalValue: number;
    unit: string | null;
    serviceId: string | null;
  };
  entries: MeasurableHistoryEntry[];
}

export function useMeasurableHistory(id: string | null, weeks = 12) {
  return useQuery<MeasurableHistory>({
    queryKey: ["measurable-history", id, weeks],
    queryFn: () => fetchApi<MeasurableHistory>(`/api/measurables/${id}/history?weeks=${weeks}`),
    enabled: !!id,
    staleTime: 60_000,
    retry: 2,
  });
}
