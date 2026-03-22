"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { ScenarioInputs, ScenarioOutputs } from "@/lib/scenario-engine";

export interface SavedScenario {
  id: string;
  name: string;
  description: string | null;
  inputs: ScenarioInputs;
  outputs: ScenarioOutputs;
  createdAt: string;
  updatedAt: string;
}

// ── List saved scenarios ─────────────────────────────────────────────────────

export function useScenarios() {
  return useQuery<SavedScenario[]>({
    queryKey: ["scenarios"],
    queryFn: () => fetchApi<SavedScenario[]>("/api/scenarios"),
    retry: 2,
  });
}

// ── Fetch current-state seed inputs ──────────────────────────────────────────

export function useCurrentStateInputs() {
  return useQuery<{ source: string; inputs: ScenarioInputs }>({
    queryKey: ["scenarios", "current-state"],
    queryFn: () => fetchApi<{ source: string; inputs: ScenarioInputs }>("/api/scenarios/current-state"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// ── Save scenario ────────────────────────────────────────────────────────────

export function useSaveScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      inputs: ScenarioInputs;
      outputs: ScenarioOutputs;
    }) => {
      return mutateApi<SavedScenario>("/api/scenarios", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ description: "Scenario saved" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete scenario ──────────────────────────────────────────────────────────

export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/scenarios/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ description: "Scenario deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
