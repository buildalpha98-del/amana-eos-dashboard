"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { CockpitSummary } from "@/lib/cockpit/summary";

export function useCockpitSummary() {
  return useQuery<CockpitSummary>({
    queryKey: ["cockpit-summary"],
    queryFn: () => fetchApi<CockpitSummary>("/api/marketing/cockpit/summary"),
    staleTime: 60_000,
    retry: 2,
  });
}

export interface WeeklyReportDetail {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: "draft" | "reviewed" | "sent";
  wins: string | null;
  blockers: string | null;
  nextWeekTop3: string | null;
  draftBody: string | null;
  draftedAt: string | null;
  reviewedAt: string | null;
  sentAt: string | null;
  reviewedBy: { id: string; name: string | null; email: string } | null;
  sentBy: { id: string; name: string | null; email: string } | null;
}

export function useCurrentWeeklyReport() {
  return useQuery<{ report: WeeklyReportDetail | null }>({
    queryKey: ["weekly-report-current"],
    queryFn: () => fetchApi("/api/marketing/cockpit/weekly-report/current"),
    staleTime: 30_000,
    retry: 2,
  });
}

export function useReviewWeeklyReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      wins?: string | null;
      blockers?: string | null;
      nextWeekTop3?: string | null;
      draftBody?: string | null;
    }) =>
      mutateApi(`/api/marketing/cockpit/weekly-report/${reportId}/review`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-report-current"] });
      qc.invalidateQueries({ queryKey: ["cockpit-summary"] });
      toast({ description: "Report marked as reviewed" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useSendWeeklyReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      mutateApi(`/api/marketing/cockpit/weekly-report/${reportId}/send`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-report-current"] });
      qc.invalidateQueries({ queryKey: ["cockpit-summary"] });
      toast({ description: "Report sent to leadership" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdatePriorities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nextWeekTop3: string | null) =>
      mutateApi("/api/marketing/cockpit/priorities", {
        method: "POST",
        body: { nextWeekTop3 },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cockpit-summary"] });
      qc.invalidateQueries({ queryKey: ["weekly-report-current"] });
      toast({ description: "Priorities updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
