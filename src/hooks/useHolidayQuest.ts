"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────

export interface HolidayQuestDayData {
  id: string;
  serviceId: string;
  date: string;
  theme: string;
  morningActivity: string;
  afternoonActivity: string;
  isExcursion: boolean;
  excursionVenue: string | null;
  excursionCost: number | null;
  materialsNeeded: string | null;
  dietaryNotes: string | null;
  maxCapacity: number;
  currentBookings: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayQuestPromoResult {
  email: { subject: string; html: string };
  socialPosts: { date: string; caption: string }[];
}

// ── Queries ────────────────────────────────────────────────

export function useHolidayQuestDays(
  serviceId: string | null,
  from?: string,
  to?: string,
  status?: string,
) {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (status) params.set("status", status);
  const query = params.toString();

  return useQuery<HolidayQuestDayData[]>({
    queryKey: ["holiday-quest", serviceId, from, to, status],
    queryFn: async () => {
      const res = await fetch(`/api/holiday-quest?${query}`);
      if (!res.ok) throw new Error("Failed to fetch Holiday Quest days");
      return res.json();
    },
    enabled: !!serviceId,
  });
}

// ── Mutations ──────────────────────────────────────────────

export function useCreateHolidayQuestDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      serviceId: string;
      days: Array<{
        date: string;
        theme: string;
        morningActivity: string;
        afternoonActivity: string;
        isExcursion?: boolean;
        excursionVenue?: string;
        excursionCost?: number;
        materialsNeeded?: string;
        dietaryNotes?: string;
        maxCapacity?: number;
      }>;
    }) => {
      const res = await fetch("/api/holiday-quest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create Holiday Quest days");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
  });
}

export function useUpdateHolidayQuestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const res = await fetch(`/api/holiday-quest/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update Holiday Quest day");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
  });
}

export function useDeleteHolidayQuestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/holiday-quest/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete Holiday Quest day");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
  });
}

export function useGenerateHolidayQuestPromo() {
  return useMutation<HolidayQuestPromoResult, Error, { serviceId: string; from: string; to: string }>({
    mutationFn: async (data) => {
      const res = await fetch("/api/communication/holiday-quest/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to generate promo content");
      return res.json();
    },
  });
}
