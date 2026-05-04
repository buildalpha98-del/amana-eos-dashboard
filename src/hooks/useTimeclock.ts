"use client";

/**
 * useTimeclock — wraps the self-service clock-in/out APIs (sub-PR 2)
 * for the MyClockCard widget on My Portal.
 *
 * Three mutations:
 *  - `useAutoClockIn()` — POST /api/roster/clock-in/auto. Returns
 *    `{ shift }` on a unique match, `{ ambiguous, candidates }` on
 *    multiple, or surfaces a 404 with `hint:"unscheduled"` so the
 *    UI can offer the unscheduled-clock-in path.
 *  - `useClockOut()` — POST /api/roster/shifts/[id]/clock-out.
 *  - `useUnscheduledClockIn()` — POST /api/roster/unscheduled-clock-in.
 *
 * 2026-05-04: timeclock v1, sub-PR 4.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface ShiftRow {
  id: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
}

interface MatchResponse {
  shift?: ShiftRow;
  ambiguous?: boolean;
  candidates?: ShiftRow[];
}

function invalidateClockSurfaces(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-shifts"] });
  qc.invalidateQueries({ queryKey: ["roster-shifts"] });
  qc.invalidateQueries({ queryKey: ["open-shifts"] });
}

export function useAutoClockIn() {
  const qc = useQueryClient();
  return useMutation<MatchResponse, Error, void>({
    mutationFn: () =>
      mutateApi<MatchResponse>(`/api/roster/clock-in/auto`, { method: "POST" }),
    onSuccess: (data) => {
      if (data.shift) {
        toast({ description: "Clocked in." });
      }
      invalidateClockSurfaces(qc);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't clock in",
      });
    },
  });
}

export function useClockIn(shiftId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ shift: ShiftRow }, Error, void>({
    mutationFn: () => {
      if (!shiftId) throw new Error("No shift selected");
      return mutateApi<{ shift: ShiftRow }>(
        `/api/roster/shifts/${shiftId}/clock-in`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      toast({ description: "Clocked in." });
      invalidateClockSurfaces(qc);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't clock in",
      });
    },
  });
}

export function useClockOut(shiftId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ shift: ShiftRow }, Error, void>({
    mutationFn: () => {
      if (!shiftId) throw new Error("No shift to close");
      return mutateApi<{ shift: ShiftRow }>(
        `/api/roster/shifts/${shiftId}/clock-out`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      toast({ description: "Clocked out — have a good one." });
      invalidateClockSurfaces(qc);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't clock out",
      });
    },
  });
}

export function useUnscheduledClockIn() {
  const qc = useQueryClient();
  return useMutation<{ shift: ShiftRow }, Error, void>({
    mutationFn: () =>
      mutateApi<{ shift: ShiftRow }>(`/api/roster/unscheduled-clock-in`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        description:
          "Clocked in (unscheduled). Admin will review your hours when they reconcile the roster.",
      });
      invalidateClockSurfaces(qc);
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't record an unscheduled clock-in",
      });
    },
  });
}

export function useSetKioskPin() {
  return useMutation<{ ok: true }, Error, { pin: string }>({
    mutationFn: ({ pin }) =>
      mutateApi<{ ok: true }>(`/api/me/kiosk-pin`, {
        method: "PATCH",
        body: { pin },
      }),
    onSuccess: () => {
      toast({ description: "PIN saved. You can now use it at the kiosk." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't save PIN",
      });
    },
  });
}
