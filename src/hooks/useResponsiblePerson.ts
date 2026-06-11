"use client";

/**
 * useResponsiblePerson — register read + mutate hooks for the per-service
 * responsible-person register. Follows the project's React Query standards
 * (retry: 2, staleTime, destructive onError toasts on every mutation).
 *
 * 2026-06-11: introduced with the RP register.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { RpSessionType } from "@/lib/responsible-person";

export interface RpEntry {
  id: string;
  serviceId: string;
  date: string; // ISO
  sessionType: RpSessionType;
  personName: string;
  personRole: string | null;
  userId: string | null;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  notes: string | null;
  user?: { id: string; name: string; avatar: string | null } | null;
}

interface ListResponse {
  entries: RpEntry[];
}

export function useResponsiblePersonRegister(
  serviceId: string | undefined,
  from: string,
  to: string,
) {
  return useQuery<ListResponse>({
    queryKey: ["responsible-person", serviceId, from, to],
    queryFn: () =>
      fetchApi<ListResponse>(
        `/api/services/${serviceId}/responsible-person?from=${from}&to=${to}`,
      ),
    enabled: !!serviceId && !!from && !!to,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface SetRpInput {
  date: string;
  sessionType: RpSessionType;
  personName: string;
  personRole?: string | null;
  userId?: string | null;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
}

export function useSetResponsiblePerson(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetRpInput) =>
      mutateApi<{ entry: RpEntry }>(
        `/api/services/${serviceId}/responsible-person`,
        { method: "POST", body: input },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["responsible-person", serviceId] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Could not save the register entry",
      });
    },
  });
}

export function useClearResponsiblePerson(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      mutateApi<{ ok: true }>(
        `/api/services/${serviceId}/responsible-person/${entryId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["responsible-person", serviceId] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Could not clear the register entry",
      });
    },
  });
}
