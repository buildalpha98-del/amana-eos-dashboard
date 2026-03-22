"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────────

export interface TimesheetData {
  id: string;
  serviceId: string;
  weekEnding: string;
  status: "ts_draft" | "submitted" | "approved" | "exported_to_xero" | "rejected";
  submittedAt: string | null;
  submittedById: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  exportedAt: string | null;
  xeroPayRunId: string | null;
  importSource: string | null;
  importFileName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string; code: string };
  _count: { entries: number };
  entries?: TimesheetEntryData[];
}

export interface TimesheetEntryData {
  id: string;
  timesheetId: string;
  userId: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  totalHours: number;
  shiftType: string;
  notes: string | null;
  isOvertime: boolean;
  payRate: number | null;
  user: { id: string; name: string; email: string };
}

export interface TimesheetImportResult {
  timesheetId: string;
  matched: string[];
  unmatched: string[];
  entriesCreated: number;
}

export interface TimesheetSummaryEntry {
  userId: string;
  userName: string;
  totalHours: number;
  shiftBreakdown: {
    bsc: number;
    asc: number;
    vac: number;
    pd: number;
    admin: number;
    other: number;
  };
}

export interface TimesheetFilters {
  serviceId?: string;
  status?: string;
  weekEndingAfter?: string;
  weekEndingBefore?: string;
}

// ── List timesheets ────────────────────────────────────────────

export function useTimesheets(filters?: TimesheetFilters) {
  return useQuery<TimesheetData[]>({
    queryKey: ["timesheets", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.weekEndingAfter) params.set("weekEndingAfter", filters.weekEndingAfter);
      if (filters?.weekEndingBefore) params.set("weekEndingBefore", filters.weekEndingBefore);
      return fetchApi<TimesheetData[]>(`/api/timesheets?${params}`);
    },
    retry: 2,
  });
}

// ── Single timesheet with entries ──────────────────────────────

export function useTimesheet(id: string | null) {
  return useQuery<TimesheetData>({
    queryKey: ["timesheet", id],
    queryFn: async () => {
      return fetchApi<TimesheetData>(`/api/timesheets/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

// ── Create timesheet ───────────────────────────────────────────

export function useCreateTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      serviceId: string;
      weekEnding: string;
      notes?: string;
    }) => {
      return mutateApi("/api/timesheets", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update timesheet ───────────────────────────────────────────

export function useUpdateTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      notes?: string | null;
    }) => {
      return mutateApi(`/api/timesheets/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete timesheet ───────────────────────────────────────────

export function useDeleteTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/timesheets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Import timesheet (OWNA XLSX) ───────────────────────────────

export function useImportTimesheet() {
  const qc = useQueryClient();
  return useMutation<
    TimesheetImportResult,
    Error,
    {
      serviceId: string;
      weekEnding: string;
      entries: Array<{
        email: string;
        date: string;
        shiftStart: string;
        shiftEnd: string;
        breakMinutes?: number;
        shiftType: string;
      }>;
    }
  >({
    mutationFn: async (data) => {
      return mutateApi<TimesheetImportResult>("/api/timesheets/import", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Add entries to timesheet ───────────────────────────────────

export function useAddTimesheetEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      timesheetId,
      entries,
    }: {
      timesheetId: string;
      entries: Array<{
        userId: string;
        date: string;
        shiftStart: string;
        shiftEnd: string;
        breakMinutes?: number;
        shiftType: string;
        notes?: string;
        payRate?: number;
      }>;
    }) => {
      return mutateApi(`/api/timesheets/${timesheetId}/entries`, {
        method: "POST",
        body: entries,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update single entry ────────────────────────────────────────

export function useUpdateTimesheetEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      date?: string;
      shiftStart?: string;
      shiftEnd?: string;
      breakMinutes?: number;
      shiftType?: string;
      notes?: string | null;
      payRate?: number | null;
      isOvertime?: boolean;
    }) => {
      return mutateApi(`/api/timesheet-entries/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete single entry ────────────────────────────────────────

export function useDeleteTimesheetEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/timesheet-entries/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheets-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Submit timesheet ───────────────────────────────────────────

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/timesheets/${id}/submit`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Approve timesheet ──────────────────────────────────────────

export function useApproveTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/timesheets/${id}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Reject timesheet ──────────────────────────────────────────

export function useRejectTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return mutateApi(`/api/timesheets/${id}/reject`, {
        method: "POST",
        body: { reason },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Export to Xero (placeholder) ───────────────────────────────

export function useExportTimesheetToXero() {
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/timesheets/${id}/export-to-xero`, {
        method: "POST",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Timesheet summary (aggregate hours) ────────────────────────

export function useTimesheetsSummary(
  serviceId?: string,
  startDate?: string,
  endDate?: string
) {
  return useQuery<TimesheetSummaryEntry[]>({
    queryKey: ["timesheets-summary", serviceId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return fetchApi<TimesheetSummaryEntry[]>(`/api/timesheets/summary?${params}`);
    },
    enabled: !!startDate && !!endDate,
    retry: 2,
  });
}

// ── Backward-compatible aliases ────────────────────────────────

/** @deprecated Use TimesheetEntryData instead */
export type TimesheetEntry = TimesheetEntryData;

/** @deprecated Use useAddTimesheetEntries instead */
export const useAddTimesheetEntry = useAddTimesheetEntries;

/** @deprecated Use useTimesheetsSummary instead */
export const useTimesheetSummary = useTimesheetsSummary;
