"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface CalendarSlot {
  id: string;
  month: number;
  courseId: string;
  active: boolean;
  course: { id: string; title: string; status: string; track: string };
}

export function useTrainingCalendar() {
  return useQuery<CalendarSlot[]>({
    queryKey: ["training-calendar"],
    staleTime: 30_000,
    retry: 2,
    queryFn: async () => fetchApi<CalendarSlot[]>("/api/training-calendar"),
  });
}

export function useAddCalendarSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { month: number; courseId: string }) =>
      mutateApi("/api/training-calendar", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-calendar"] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Something went wrong" }),
  });
}

export function useRemoveCalendarSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      mutateApi(`/api/training-calendar/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-calendar"] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message || "Something went wrong" }),
  });
}
