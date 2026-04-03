"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────

export interface RollCallChild {
  id: string;
  firstName: string;
  surname: string;
  medical: Record<string, unknown> | null;
  dietary: Record<string, unknown> | null;
}

export interface RollCallEntry {
  childId: string;
  child: RollCallChild;
  bookingType: string;
  status: "booked" | "present" | "absent";
  signInTime: string | null;
  signOutTime: string | null;
  signedInBy: { id: string; name: string } | null;
  signedOutBy: { id: string; name: string } | null;
  absenceReason: string | null;
  notes: string | null;
}

export type RollCallAction = "sign_in" | "sign_out" | "mark_absent" | "undo";

interface RollCallActionPayload {
  childId: string;
  serviceId: string;
  date: string;
  sessionType: string;
  action: RollCallAction;
  absenceReason?: string;
  notes?: string;
}

// ── Hooks ────────────────────────────────────────────────

export function useRollCall(serviceId: string, date: string, sessionType: string) {
  const params = new URLSearchParams({
    serviceId,
    date,
    sessionType,
  });

  return useQuery<RollCallEntry[]>({
    queryKey: ["roll-call", serviceId, date, sessionType],
    queryFn: () => fetchApi<RollCallEntry[]>(`/api/attendance/roll-call?${params}`),
    enabled: !!serviceId && !!date && !!sessionType,
    staleTime: 15_000, // 15s — roll call changes frequently during session
    retry: 2,
  });
}

export function useUpdateRollCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RollCallActionPayload) =>
      mutateApi("/api/attendance/roll-call", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (_data, variables) => {
      // Invalidate both the individual roll call AND the aggregate attendance
      queryClient.invalidateQueries({
        queryKey: ["roll-call", variables.serviceId, variables.date, variables.sessionType],
      });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to update attendance" });
    },
  });
}
