"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface EntryUser {
  id: string;
  name: string;
}

export interface MeasurableEntry {
  id: string;
  measurableId: string;
  weekOf: string;
  value: number;
  onTrack: boolean;
  notes: string | null;
  enteredBy: EntryUser;
  createdAt: string;
}

export interface MeasurableOwner {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface MeasurableData {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: MeasurableOwner;
  goalValue: number;
  goalDirection: "above" | "below" | "exact";
  unit: string | null;
  frequency: "weekly" | "monthly";
  rockId: string | null;
  rock: { id: string; title: string } | null;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  entries: MeasurableEntry[];
}

export interface ScorecardData {
  id: string;
  title: string;
  measurables: MeasurableData[];
}

export function useScorecard() {
  return useQuery<ScorecardData>({
    queryKey: ["scorecard"],
    queryFn: () => fetchApi<ScorecardData>("/api/scorecard"),
    staleTime: 2 * 60_000, // Scorecard data: 2 min stale time
    retry: 2,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      measurableId,
      weekOf,
      value,
      notes,
    }: {
      measurableId: string;
      weekOf: string;
      value: number;
      notes?: string;
    }) => {
      return mutateApi(`/api/measurables/${measurableId}/entries`, {
        method: "POST",
        body: { weekOf, value, notes },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
