"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatementListItem {
  id: string;
  contactId: string;
  serviceId: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: string;
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
  contact: { id: string; firstName: string | null; lastName: string | null; email: string };
  service: { id: string; name: string };
  _count: { lineItems: number; payments: number };
}

export interface StatementDetail extends Omit<StatementListItem, "_count"> {
  lineItems: {
    id: string;
    childId: string;
    date: string;
    sessionType: string;
    description: string;
    grossFee: number;
    ccsHours: number;
    ccsRate: number;
    ccsAmount: number;
    gapAmount: number;
    child: { id: string; firstName: string; surname: string | null };
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedAt: string;
    notes: string | null;
    recordedBy: { id: string; name: string } | null;
  }[];
}

interface StatementsResponse {
  statements: StatementListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface FamilySummary {
  contact: { id: string; firstName: string | null; lastName: string | null; email: string };
  totalOutstanding: number;
  statements: StatementListItem[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedAt: string;
  }[];
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useBillingStatements(filters?: {
  serviceId?: string;
  status?: string;
  page?: number;
}) {
  const serviceId = filters?.serviceId;
  const status = filters?.status;
  const page = filters?.page;

  return useQuery<StatementsResponse>({
    queryKey: ["billing", "statements", serviceId, status, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (serviceId) params.set("serviceId", serviceId);
      if (status) params.set("status", status);
      if (page !== undefined) params.set("page", String(page));
      const qs = params.toString();
      return fetchApi<StatementsResponse>(
        `/api/billing/statements${qs ? `?${qs}` : ""}`,
      );
    },
    retry: 2,
    staleTime: 30_000,
  });
}

export function useBillingStatementDetail(id: string | null) {
  return useQuery<StatementDetail>({
    queryKey: ["billing", "statement", id],
    queryFn: () => fetchApi<StatementDetail>(`/api/billing/statements/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useFamilySummary(familyId: string | null) {
  return useQuery<FamilySummary>({
    queryKey: ["billing", "family", familyId],
    queryFn: () =>
      fetchApi<FamilySummary>(`/api/billing/families/${familyId}/summary`),
    enabled: !!familyId,
    retry: 2,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateStatement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi<StatementListItem>("/api/billing/statements", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "statements"] });
      toast({ description: "Statement created" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useIssueStatement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/billing/statements/${id}/issue`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ description: "Statement issued" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useVoidStatement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/billing/statements/${id}/void`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ description: "Statement voided" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi("/api/billing/payments", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ description: "Payment recorded" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}

export function useEditDraftStatement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutateApi(`/api/billing/statements/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ description: "Draft updated" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}
