"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/scorecard");
      if (!res.ok) throw new Error("Failed to fetch scorecard");
      return res.json();
    },
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
      const res = await fetch(`/api/measurables/${measurableId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf, value, notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard"] });
    },
  });
}
