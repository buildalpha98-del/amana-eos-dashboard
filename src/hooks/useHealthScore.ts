"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthScoreDetail {
  current: {
    overallScore: number;
    trend: "improving" | "declining" | "stable";
    status: "green" | "amber" | "red";
    pillars: {
      financial: { score: number; breakdown: Record<string, number> };
      operational: { score: number; breakdown: Record<string, number> };
      compliance: { score: number; breakdown: Record<string, number> };
      satisfaction: { score: number; breakdown: Record<string, number> };
      teamCulture: { score: number; breakdown: Record<string, number> };
    };
  };
  history: {
    periodStart: string;
    overallScore: number;
    trend: string;
    pillars: {
      financial: number;
      operational: number;
      compliance: number;
      satisfaction: number;
      teamCulture: number;
    };
  }[];
  recommendations: {
    pillar: string;
    pillarLabel: string;
    severity: "critical" | "warning" | "info";
    message: string;
    metric: string;
    currentValue: number;
    targetValue: number;
  }[];
  networkComparison: {
    centreScore: number;
    networkAvg: number;
    rank: number;
    totalCentres: number;
    pillarComparison: Record<string, { centre: number; networkAvg: number }>;
  };
}

// ─── Detail Hook ────────────────────────────────────────────────────────────

export function useHealthScore(serviceId: string | null) {
  return useQuery<HealthScoreDetail>({
    queryKey: ["health-score", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/health-scores/${serviceId}`);
      if (!res.ok) throw new Error("Failed to fetch health score");
      return res.json();
    },
    enabled: !!serviceId,
  });
}

// ─── Compute Mutation ───────────────────────────────────────────────────────

export function useComputeHealthScores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/health-scores/compute", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to compute health scores");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
      queryClient.invalidateQueries({ queryKey: ["performance"] });
      queryClient.invalidateQueries({ queryKey: ["performance-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
    },
  });
}
