"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
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
    queryFn: () => fetchApi<BoardReportSummary[]>("/api/reports/board"),
    retry: 2,
  });
}

// ── Detail ─────────────────────────────────────────────────

export function useBoardReport(id: string | null) {
  return useQuery<BoardReportFull>({
    queryKey: ["board-report", id],
    queryFn: () => fetchApi<BoardReportFull>(`/api/reports/board/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

// ── Generate ───────────────────────────────────────────────

export function useGenerateBoardReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { month: number; year: number }) => {
      return mutateApi<BoardReportSummary>("/api/reports/board", { method: "POST", body: params });
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
      return mutateApi(`/api/reports/board/${id}`, { method: "PATCH", body: updates });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board-report", id] });
      qc.invalidateQueries({ queryKey: ["board-reports"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Send ───────────────────────────────────────────────────

export function useSendBoardReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipients?: string[]) => {
      return mutateApi<{ emailsSent: number }>(`/api/reports/board/${id}/send`, {
        method: "POST",
        body: { recipients },
      });
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
