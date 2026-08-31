"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────

export interface PilotCentreSummary {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  target: number;
  teamBonusAmount: number;
  totalRecords: number;
  qualifiedCount: number;
  teamBonusEarned: boolean;
}

export interface PilotOverviewData {
  pilot: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: "draft" | "active" | "closed";
    centres: PilotCentreSummary[];
    totals: {
      records: number;
      qualified: number;
      conflicts: number;
      gross: number;
      superAmount: number;
    };
    attribution: Record<string, number>;
    leaderboard: { firstName: string; qualified: number; total: number }[];
  } | null;
}

export interface AmbassadorRecordSummary {
  id: string;
  childInitials: string;
  serviceId: string;
  service: { name: string; code: string };
  creditedEducatorId: string | null;
  creditedEducator: { name: string } | null;
  namedEducatorText: string | null;
  refCode: string | null;
  attributionSource: "form_field" | "qr_ref" | "both" | "unknown";
  attributionConflict: boolean;
  newChildStatus: "new_child" | "existing_child" | "uncertain";
  regularSessionsPerWeek: number | null;
  firstAttendanceDate: string | null;
  paidSessionsAttended: number;
  tierAmount: number | null;
  incentiveAmount: number | null;
  qualified: boolean;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

export interface AmbassadorSessionRow {
  id: string;
  date: string;
  sessionType: string;
  fee: number;
  source: string;
}

export interface AmbassadorRecordDetail extends AmbassadorRecordSummary {
  sessions: AmbassadorSessionRow[];
  transitions: {
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    createdAt: string;
    actor: { name: string } | null;
  }[];
}

export interface RefCodeRow {
  id: string;
  code: string;
  active: boolean;
  user: {
    id: string;
    name: string;
    role: string;
    service: { name: string; code: string } | null;
  };
  signupUrl: string;
  qrUrl: string;
  scanCount: number;
  svg?: string;
  png?: string;
}

export interface PayrollPreview {
  groups: {
    name: string;
    employeeId: number | null;
    centres: string[];
    count: number;
    gross: number;
    kicker: number;
    superAmount: number;
  }[];
  held: { educatorId: string; name: string; recordCount: number }[];
}

// ── Queries ──────────────────────────────────────────────────

export function usePilotOverview() {
  return useQuery({
    queryKey: ["ambassadors", "pilot"],
    queryFn: () => fetchApi<PilotOverviewData>("/api/ambassadors/pilot"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useAmbassadorRecords(filters?: {
  status?: string;
  conflictsOnly?: boolean;
  uncertainOnly?: boolean;
  dueSoon?: boolean;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.conflictsOnly) params.set("conflictsOnly", "1");
  if (filters?.uncertainOnly) params.set("uncertainOnly", "1");
  if (filters?.dueSoon) params.set("dueSoon", "1");
  const qs = params.toString();

  return useQuery({
    // Primitive-only query key — filter objects cause cache misses.
    queryKey: [
      "ambassadors",
      "records",
      filters?.status ?? "",
      filters?.conflictsOnly ?? false,
      filters?.uncertainOnly ?? false,
      filters?.dueSoon ?? false,
    ],
    queryFn: () =>
      fetchApi<{ records: AmbassadorRecordSummary[] }>(
        `/api/ambassadors/records${qs ? `?${qs}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useAmbassadorRecord(id: string | null) {
  return useQuery({
    queryKey: ["ambassadors", "record", id ?? ""],
    queryFn: () =>
      fetchApi<{ record: AmbassadorRecordDetail; lmsCompleted: boolean | null }>(
        `/api/ambassadors/records/${id}`,
      ),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRefCodes(withImages = false) {
  return useQuery({
    queryKey: ["ambassadors", "ref-codes", withImages],
    queryFn: () =>
      fetchApi<{ codes: RefCodeRow[] }>(
        `/api/ambassadors/ref-codes${withImages ? "?images=1" : ""}`,
      ),
    retry: 2,
    staleTime: 60_000,
  });
}

export function usePayrollPreview(enabled: boolean) {
  return useQuery({
    queryKey: ["ambassadors", "payroll-preview"],
    queryFn: () =>
      mutateApi<PayrollPreview>("/api/ambassadors/payroll-export", {
        method: "POST",
        body: { action: "preview" },
      }),
    enabled,
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Mutations ────────────────────────────────────────────────

const onError = (err: Error) => {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
};

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
}

export function useUpdateRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      id: string;
      regularSessionsPerWeek?: number | null;
      creditedEducatorId?: string | null;
      newChildStatus?: "new_child" | "existing_child";
    }) =>
      mutateApi(`/api/ambassadors/records/${input.id}`, {
        method: "PATCH",
        body: {
          ...(input.regularSessionsPerWeek !== undefined
            ? { regularSessionsPerWeek: input.regularSessionsPerWeek }
            : {}),
          ...(input.creditedEducatorId !== undefined
            ? { creditedEducatorId: input.creditedEducatorId }
            : {}),
          ...(input.newChildStatus !== undefined
            ? { newChildStatus: input.newChildStatus }
            : {}),
        },
      }),
    onSuccess: () => invalidate(),
    onError,
  });
}

export function useTransitionRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; to: string; reason?: string }) =>
      mutateApi(`/api/ambassadors/records/${input.id}/transition`, {
        method: "POST",
        body: { to: input.to, ...(input.reason ? { reason: input.reason } : {}) },
      }),
    onSuccess: () => invalidate(),
    onError,
  });
}

export function useQuickSessions() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      id: string;
      sessions: { date: string; sessionType?: string; fee: number }[];
    }) =>
      mutateApi(`/api/ambassadors/records/${input.id}/sessions`, {
        method: "POST",
        body: { sessions: input.sessions },
      }),
    onSuccess: () => {
      toast({ description: "Sessions saved" });
      invalidate();
    },
    onError,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; sessionId: string }) =>
      mutateApi(`/api/ambassadors/records/${input.id}/sessions`, {
        method: "DELETE",
        body: { sessionId: input.sessionId },
      }),
    onSuccess: () => invalidate(),
    onError,
  });
}

export function useGenerateRefCodes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      mutateApi<{ created: number; existing: number }>(
        "/api/ambassadors/ref-codes",
        { method: "POST", body: {} },
      ),
    onSuccess: (res) => {
      toast({
        description: `${res.created} new code${res.created === 1 ? "" : "s"} created (${res.existing} already existed)`,
      });
      invalidate();
    },
    onError,
  });
}

export function useUpdatePilot() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      action: "activate" | "close" | "update";
      name?: string;
      startDate?: string;
      endDate?: string;
      centres?: {
        serviceId: string;
        targetQualifiedEnrolments: number;
        teamBonusAmount?: number;
      }[];
    }) =>
      mutateApi("/api/ambassadors/pilot", { method: "PATCH", body: input }),
    onSuccess: () => {
      toast({ description: "Pilot updated" });
      invalidate();
    },
    onError,
  });
}

export function usePayrollAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { action: "send" | "mark-paid" }) =>
      mutateApi<{ sent?: number; markedPaid?: number; held?: unknown[] }>(
        "/api/ambassadors/payroll-export",
        { method: "POST", body: input },
      ),
    onSuccess: (res, vars) => {
      toast({
        description:
          vars.action === "send"
            ? `${res.sent ?? 0} record${res.sent === 1 ? "" : "s"} sent to payroll`
            : `${res.markedPaid ?? 0} record${res.markedPaid === 1 ? "" : "s"} marked paid`,
      });
      invalidate();
    },
    onError,
  });
}
