"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ───────────────────────────────────────────────────

export interface GroceryBreakdown {
  total: number;
  bsc: { attended: number; rate: number; cost: number };
  asc: { attended: number; rate: number; cost: number };
  vc: { attended: number; rate: number; cost: number };
}

export interface EquipmentCategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface BudgetPeriod {
  period: string;
  groceryCost: number;
  equipmentCost: number;
  total: number;
  bscAttendance: number;
  ascAttendance: number;
  vcAttendance: number;
}

// 2026-06-05: current-period aggregate. Same per-session shape as
// GroceryBreakdown but scoped to *this week* or *this month* per the
// `period` query param. Lets the cards and breakdown table match
// their "This week"/"This month" labels (the FY-scoped groceryBudget
// was being shown under a per-period label, which read as wrong
// numbers).
export interface CurrentPeriodSummary {
  period: string;
  bsc: { attended: number; rate: number; cost: number };
  asc: { attended: number; rate: number; cost: number };
  vc: { attended: number; rate: number; cost: number };
  groceryTotal: number;
  /** Actual grocery receipts logged for the selected week. */
  groceryActualSpend: number;
  /** groceryTotal − groceryActualSpend, floored at 0. */
  groceryRemaining: number;
  equipmentTotal: number;
  combinedTotal: number;
}

export interface BudgetSummary {
  groceryBudget: GroceryBreakdown;
  currentPeriod: CurrentPeriodSummary;
  equipmentBudget: {
    total: number;
    byCategory: EquipmentCategorySummary[];
  };
  combinedTotal: number;
  monthlyAllocation: number;
  allocationSource: "override" | "tier";
  allocationLabel: string;
  monthToDatePurchaseSpend: number;
  budgetRemaining: number;
  periods: BudgetPeriod[];
  range: { from: string; to: string };
  rates: { bsc: number; asc: number; vc: number };
}

export interface BudgetItemRecord {
  id: string;
  serviceId: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  notes: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Budget Summary ──────────────────────────────────────────

export function useBudgetSummary(params: {
  serviceId: string;
  from?: string;
  to?: string;
  period?: "weekly" | "monthly";
  /** 2026-06-05: YYYY-MM-DD anchor for the currentPeriod bucket. Lets
   *  the Budget tab focus on the same week the coordinator is viewing
   *  in the Daily Operations grid. Defaults server-side to today. */
  asOf?: string;
}) {
  return useQuery<BudgetSummary>({
    staleTime: 30_000,
    queryKey: [
      "budget-summary",
      params.serviceId,
      params.from,
      params.to,
      params.period,
      params.asOf,
    ],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.period) sp.set("period", params.period);
      if (params.asOf) sp.set("asOf", params.asOf);
      return fetchApi<BudgetSummary>(`/api/services/${params.serviceId}/budget?${sp}`);
    },
    enabled: !!params.serviceId,
    retry: 2,
  });
}

// ── Equipment Items ─────────────────────────────────────────

export function useEquipmentItems(params: {
  serviceId: string;
  from?: string;
  to?: string;
  category?: string;
}) {
  return useQuery<BudgetItemRecord[]>({
    staleTime: 30_000,
    queryKey: ["equipment-items", params.serviceId, params.from, params.to, params.category],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.category) sp.set("category", params.category);
      return fetchApi<BudgetItemRecord[]>(`/api/services/${params.serviceId}/budget/equipment?${sp}`);
    },
    enabled: !!params.serviceId,
    retry: 2,
  });
}

// ── Create Equipment Item ───────────────────────────────────

export function useCreateEquipmentItem(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      amount: number;
      category: string;
      date: string;
      notes?: string;
    }) => {
      return mutateApi(`/api/services/${serviceId}/budget/equipment`, { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update Equipment Item ───────────────────────────────────

export function useUpdateEquipmentItem(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      ...data
    }: {
      itemId: string;
      name?: string;
      amount?: number;
      category?: string;
      date?: string;
      notes?: string | null;
    }) => {
      return mutateApi(`/api/services/${serviceId}/budget/equipment/${itemId}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Delete Equipment Item ───────────────────────────────────

export function useDeleteEquipmentItem(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      return mutateApi(`/api/services/${serviceId}/budget/equipment/${itemId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
