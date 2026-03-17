"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

export interface BudgetSummary {
  groceryBudget: GroceryBreakdown;
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
}) {
  return useQuery<BudgetSummary>({
    queryKey: ["budget-summary", params.serviceId, params.from, params.to, params.period],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.period) sp.set("period", params.period);
      const res = await fetch(`/api/services/${params.serviceId}/budget?${sp}`);
      if (!res.ok) throw new Error("Failed to fetch budget summary");
      return res.json();
    },
    enabled: !!params.serviceId,
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
    queryKey: ["equipment-items", params.serviceId, params.from, params.to, params.category],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.category) sp.set("category", params.category);
      const res = await fetch(`/api/services/${params.serviceId}/budget/equipment?${sp}`);
      if (!res.ok) throw new Error("Failed to fetch equipment items");
      return res.json();
    },
    enabled: !!params.serviceId,
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
      const res = await fetch(`/api/services/${serviceId}/budget/equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create equipment item");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
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
      const res = await fetch(`/api/services/${serviceId}/budget/equipment/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update equipment item");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
  });
}

// ── Delete Equipment Item ───────────────────────────────────

export function useDeleteEquipmentItem(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/services/${serviceId}/budget/equipment/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete equipment item");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
  });
}
