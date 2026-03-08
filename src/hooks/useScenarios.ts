"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
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
    queryFn: async () => {
      const res = await fetch("/api/scenarios");
      if (!res.ok) throw new Error("Failed to fetch scenarios");
      return res.json();
    },
  });
}

// ── Fetch current-state seed inputs ──────────────────────────────────────────

export function useCurrentStateInputs() {
  return useQuery<{ source: string; inputs: ScenarioInputs }>({
    queryKey: ["scenarios", "current-state"],
    queryFn: async () => {
      const res = await fetch("/api/scenarios/current-state");
      if (!res.ok) throw new Error("Failed to fetch current state");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save scenario");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ description: "Scenario saved" });
    },
  });
}

// ── Delete scenario ──────────────────────────────────────────────────────────

export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scenario");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast({ description: "Scenario deleted" });
    },
  });
}
