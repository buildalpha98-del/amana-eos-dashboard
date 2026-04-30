"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

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
    queryFn: () => fetchApi<HolidayQuestDayData[]>(`/api/holiday-quest?${query}`),
    enabled: !!serviceId,
    retry: 2,
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
      return mutateApi("/api/holiday-quest", { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateHolidayQuestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      return mutateApi(`/api/holiday-quest/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteHolidayQuestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/holiday-quest/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holiday-quest"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

type HolidayQuestPromoInput = { serviceId: string; from: string; to: string };

export function useGenerateHolidayQuestPromo() {
  return useMutation<HolidayQuestPromoResult, Error, HolidayQuestPromoInput>({
    mutationFn: async (data) => {
      return mutateApi<HolidayQuestPromoResult>("/api/communication/holiday-quest/promo", {
        method: "POST",
        body: data,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
