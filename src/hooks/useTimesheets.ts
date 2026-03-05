"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
      const res = await fetch(`/api/timesheets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return res.json();
    },
  });
}

// ── Single timesheet with entries ──────────────────────────────

export function useTimesheet(id: string | null) {
  return useQuery<TimesheetData>({
    queryKey: ["timesheet", id],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${id}`);
      if (!res.ok) throw new Error("Failed to fetch timesheet");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
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
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
  });
}

// ── Delete timesheet ───────────────────────────────────────────

export function useDeleteTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
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
      const res = await fetch("/api/timesheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to import timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
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
      const res = await fetch(`/api/timesheets/${timesheetId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add entries");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
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
      const res = await fetch(`/api/timesheet-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update entry");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets-summary"] });
    },
  });
}

// ── Delete single entry ────────────────────────────────────────

export function useDeleteTimesheetEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheet-entries/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete entry");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheets-summary"] });
    },
  });
}

// ── Submit timesheet ───────────────────────────────────────────

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
  });
}

// ── Approve timesheet ──────────────────────────────────────────

export function useApproveTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to approve timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
  });
}

// ── Reject timesheet ──────────────────────────────────────────

export function useRejectTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await fetch(`/api/timesheets/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reject timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["timesheet"] });
    },
  });
}

// ── Export to Xero (placeholder) ───────────────────────────────

export function useExportTimesheetToXero() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}/export-to-xero`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to export to Xero");
      }
      return res.json();
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
      const res = await fetch(`/api/timesheets/summary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch timesheet summary");
      return res.json();
    },
    enabled: !!startDate && !!endDate,
  });
}

// ── Backward-compatible aliases ────────────────────────────────

/** @deprecated Use TimesheetEntryData instead */
export type TimesheetEntry = TimesheetEntryData;

/** @deprecated Use useAddTimesheetEntries instead */
export const useAddTimesheetEntry = useAddTimesheetEntries;

/** @deprecated Use useTimesheetsSummary instead */
export const useTimesheetSummary = useTimesheetsSummary;
