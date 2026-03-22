"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { SessionType } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  serviceId: string;
  date: string;
  sessionType: SessionType;
  enrolled: number;
  attended: number;
  capacity: number;
  casual: number;
  absent: number;
  notes: string | null;
  recordedById: string | null;
  recordedBy: { id: string; name: string } | null;
  service: { id: string; name: string; code: string };
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSummaryBucket {
  period: string;
  bsc: SessionBucket;
  asc: SessionBucket;
  vc: SessionBucket;
}

interface SessionBucket {
  enrolled: number;
  attended: number;
  capacity: number;
  casual: number;
  occupancyRate: number;
  days: number;
}

export interface AttendanceSummaryResponse {
  summary: AttendanceSummaryBucket[];
  totals: {
    totalEnrolled: number;
    totalAttended: number;
    totalCapacity: number;
    overallOccupancy: number;
    bscOccupancy: number;
    ascOccupancy: number;
  };
  range: { from: string; to: string };
  recordCount: number;
}

export interface AttendanceInput {
  serviceId: string;
  date: string;
  sessionType: SessionType;
  enrolled: number;
  attended: number;
  capacity: number;
  casual?: number;
  absent?: number;
  notes?: string;
}

// ── Hooks ───────────────────────────────────────────────────

export function useAttendance(params?: {
  serviceId?: string;
  from?: string;
  to?: string;
  sessionType?: SessionType;
}) {
  return useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", params],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params?.serviceId) sp.set("serviceId", params.serviceId);
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      if (params?.sessionType) sp.set("sessionType", params.sessionType);
      return fetchApi<AttendanceRecord[]>(`/api/attendance?${sp}`);
    },
    retry: 2,
  });
}

export function useAttendanceSummary(params?: {
  serviceId?: string;
  from?: string;
  to?: string;
  period?: "weekly" | "monthly";
}) {
  return useQuery<AttendanceSummaryResponse>({
    queryKey: ["attendance-summary", params],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params?.serviceId) sp.set("serviceId", params.serviceId);
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      if (params?.period) sp.set("period", params.period);
      return fetchApi<AttendanceSummaryResponse>(`/api/attendance/summary?${sp}`);
    },
    retry: 2,
  });
}

export function useCreateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: AttendanceInput) => {
      return mutateApi("/api/attendance", { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useBatchUpdateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (records: AttendanceInput[]) => {
      return mutateApi("/api/attendance", { method: "PUT", body: records });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-summary"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
