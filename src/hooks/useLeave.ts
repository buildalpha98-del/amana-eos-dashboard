"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────────

export interface LeaveRequestData {
  id: string;
  userId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  isHalfDay: boolean;
  reason: string | null;
  status: "leave_pending" | "leave_approved" | "leave_rejected" | "leave_cancelled";
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  serviceId: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string; avatar: string | null };
  reviewedBy: { id: string; name: string; email: string } | null;
  service: { id: string; name: string; code: string } | null;
}

export interface LeaveBalanceData {
  id: string;
  userId: string;
  leaveType: string;
  balance: number;
  accrued: number;
  taken: number;
  pending: number;
  asOfDate: string;
  source: string;
  user: { id: string; name: string; email: string };
}

export interface LeaveCalendarEntry {
  userId: string;
  userName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  totalDays: number;
}

export interface LeaveRequestFilters {
  userId?: string;
  status?: string;
  serviceId?: string;
  leaveType?: string;
  startAfter?: string;
  startBefore?: string;
}

// ── Hooks ──────────────────────────────────────────────────────

export function useLeaveRequests(filters?: LeaveRequestFilters) {
  return useQuery<LeaveRequestData[]>({
    queryKey: ["leave-requests", filters],
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.userId) params.set("userId", filters.userId);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.serviceId) params.set("serviceId", filters.serviceId);
      if (filters?.leaveType) params.set("leaveType", filters.leaveType);
      if (filters?.startAfter) params.set("startAfter", filters.startAfter);
      if (filters?.startBefore) params.set("startBefore", filters.startBefore);
      return fetchApi<LeaveRequestData[]>(`/api/leave/requests?${params}`);
    },
    retry: 2,
  });
}

export function useLeaveRequest(id: string | null) {
  return useQuery<LeaveRequestData>({
    queryKey: ["leave-request", id],
    queryFn: async () => {
      return fetchApi<LeaveRequestData>(`/api/leave/requests/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      leaveType: string;
      startDate: string;
      endDate: string;
      isHalfDay?: boolean;
      reason?: string;
    }) => {
      return mutateApi("/api/leave/requests", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      status?: string;
      leaveType?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
      reviewNotes?: string;
    }) => {
      return mutateApi(`/api/leave/requests/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onMutate: async (vars) => {
      if (!vars.status) return;
      await qc.cancelQueries({ queryKey: ["leave-requests"] });
      const queries = qc.getQueriesData<LeaveRequestData[]>({ queryKey: ["leave-requests"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        qc.setQueryData<LeaveRequestData[]>(key,
          data.map((lr) =>
            lr.id === vars.id
              ? { ...lr, status: vars.status as LeaveRequestData["status"] }
              : lr
          ),
        );
      }
      return { queries };
    },
    onError: (_err: Error, _vars, ctx) => {
      if (ctx?.queries) {
        for (const [key, data] of ctx.queries) {
          qc.setQueryData(key, data);
        }
      }
      toast({ variant: "destructive", description: _err.message || "Something went wrong" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-request"] });
      qc.invalidateQueries({ queryKey: ["leave-calendar"] });
    },
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/leave/requests/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-request"] });
      qc.invalidateQueries({ queryKey: ["leave-calendar"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useLeaveBalances(userId?: string) {
  return useQuery<LeaveBalanceData[]>({
    queryKey: ["leave-balances", userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      return fetchApi<LeaveBalanceData[]>(`/api/leave/balances?${params}`);
    },
    retry: 2,
  });
}

export function useLeaveCalendar(
  serviceId?: string,
  year?: number,
  month?: number
) {
  return useQuery<LeaveCalendarEntry[]>({
    queryKey: ["leave-calendar", serviceId, year, month],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      if (year) params.set("year", year.toString());
      if (month) params.set("month", month.toString());
      return fetchApi<LeaveCalendarEntry[]>(`/api/leave/calendar?${params}`);
    },
    enabled: !!year && !!month,
    retry: 2,
  });
}
