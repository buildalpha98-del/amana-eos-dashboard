"use client";

/**
 * useOpenShifts — surfaces unassigned shifts the current user is eligible
 * to claim. Companion hook to PR #53's `POST /api/roster/shifts/[id]/claim`
 * and the new `OpenShiftsCard` widget on My Portal.
 *
 * 2026-05-02: introduced as the staff-facing half of the open-shift
 * workflow — without this, admins could create open shifts but staff had
 * no way to find them.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface OpenShift {
  id: string;
  serviceId: string;
  date: string;
  sessionType: string;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  status: string;
  staffName: string;
  service: { id: string; name: string; code: string };
}

interface ListResponse {
  shifts: OpenShift[];
}

export function useOpenShifts(daysAhead = 14) {
  return useQuery<ListResponse>({
    queryKey: ["open-shifts", daysAhead],
    queryFn: () =>
      fetchApi<ListResponse>(`/api/roster/shifts/open?daysAhead=${daysAhead}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useClaimShift() {
  const qc = useQueryClient();
  return useMutation<{ shift: unknown }, Error, { shiftId: string }>({
    mutationFn: ({ shiftId }) =>
      mutateApi<{ shift: unknown }>(`/api/roster/shifts/${shiftId}/claim`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open-shifts"] });
      qc.invalidateQueries({ queryKey: ["my-shifts"] });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      toast({ description: "Shift claimed — added to your week." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't claim that shift",
      });
    },
  });
}
