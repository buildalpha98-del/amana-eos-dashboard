"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
      const res = await fetch(`/api/leave/requests?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leave requests");
      return res.json();
    },
  });
}

export function useLeaveRequest(id: string | null) {
  return useQuery<LeaveRequestData>({
    queryKey: ["leave-request", id],
    queryFn: async () => {
      const res = await fetch(`/api/leave/requests/${id}`);
      if (!res.ok) throw new Error("Failed to fetch leave request");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create leave request");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
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
      const res = await fetch(`/api/leave/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update leave request");
      }
      return res.json();
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
    onError: (_err, _vars, ctx) => {
      if (ctx?.queries) {
        for (const [key, data] of ctx.queries) {
          qc.setQueryData(key, data);
        }
      }
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
      const res = await fetch(`/api/leave/requests/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to cancel leave request");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-request"] });
      qc.invalidateQueries({ queryKey: ["leave-calendar"] });
    },
  });
}

export function useLeaveBalances(userId?: string) {
  return useQuery<LeaveBalanceData[]>({
    queryKey: ["leave-balances", userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/leave/balances?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leave balances");
      return res.json();
    },
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
      const res = await fetch(`/api/leave/calendar?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leave calendar");
      return res.json();
    },
    enabled: !!year && !!month,
  });
}
