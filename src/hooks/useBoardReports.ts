"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import type { BoardReportData } from "@/lib/board-report-generator";

// ── Types ──────────────────────────────────────────────────

export interface BoardReportSummary {
  id: string;
  month: number;
  year: number;
  status: "draft" | "final" | "sent";
  generatedAt: string;
  sentAt: string | null;
}

export interface BoardReportFull extends BoardReportSummary {
  data: BoardReportData;
  executiveSummary: string | null;
  financialNarrative: string | null;
  operationsNarrative: string | null;
  complianceNarrative: string | null;
  growthNarrative: string | null;
  peopleNarrative: string | null;
  rocksNarrative: string | null;
}

// ── List ───────────────────────────────────────────────────

export function useBoardReports() {
  return useQuery<BoardReportSummary[]>({
    queryKey: ["board-reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports/board");
      if (!res.ok) throw new Error("Failed to fetch board reports");
      return res.json();
    },
  });
}

// ── Detail ─────────────────────────────────────────────────

export function useBoardReport(id: string | null) {
  return useQuery<BoardReportFull>({
    queryKey: ["board-report", id],
    queryFn: async () => {
      const res = await fetch(`/api/reports/board/${id}`);
      if (!res.ok) throw new Error("Failed to fetch board report");
      return res.json();
    },
    enabled: !!id,
  });
}

// ── Generate ───────────────────────────────────────────────

export function useGenerateBoardReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { month: number; year: number }) => {
      const res = await fetch("/api/reports/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate report");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-reports"] });
      toast({ description: "Board report generated successfully" });
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });
}

// ── Update ─────────────────────────────────────────────────

export function useUpdateBoardReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          BoardReportFull,
          | "executiveSummary"
          | "financialNarrative"
          | "operationsNarrative"
          | "complianceNarrative"
          | "growthNarrative"
          | "peopleNarrative"
          | "rocksNarrative"
          | "status"
        >
      >,
    ) => {
      const res = await fetch(`/api/reports/board/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update report");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-report", id] });
      qc.invalidateQueries({ queryKey: ["board-reports"] });
    },
  });
}

// ── Send ───────────────────────────────────────────────────

export function useSendBoardReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipients?: string[]) => {
      const res = await fetch(`/api/reports/board/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      if (!res.ok) throw new Error("Failed to send report");
      return res.json() as Promise<{ emailsSent: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["board-report", id] });
      qc.invalidateQueries({ queryKey: ["board-reports"] });
      toast({ description: `Report sent to ${data.emailsSent} recipient(s)` });
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });
}
