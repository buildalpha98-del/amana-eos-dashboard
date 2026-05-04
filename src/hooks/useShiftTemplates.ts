"use client";

/**
 * useShiftTemplates — saved shift patterns ("ASC educator 3-6pm" etc).
 * Admin manages them; the shift-create flow picks from them to pre-fill
 * sessionType / shiftStart / shiftEnd / role.
 *
 * 2026-05-04: shipped as the smallest piece of the larger drag-to-
 * create + templates spec.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ShiftTemplate {
  id: string;
  serviceId: string;
  label: string;
  sessionType: "bsc" | "asc" | "vc";
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  role: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  templates: ShiftTemplate[];
}

export function useShiftTemplates(serviceId: string | undefined) {
  return useQuery<ListResponse>({
    queryKey: ["shift-templates", serviceId],
    queryFn: () =>
      fetchApi<ListResponse>(
        `/api/roster/shift-templates?serviceId=${serviceId}`,
      ),
    enabled: !!serviceId,
    retry: 2,
    // Templates change rarely — admin tweaks once and they sit. Keep
    // them fresh-ish but don't thrash.
    staleTime: 5 * 60_000,
  });
}

interface CreateInput {
  serviceId: string;
  label: string;
  sessionType: "bsc" | "asc" | "vc";
  shiftStart: string;
  shiftEnd: string;
  role?: string | null;
}

export function useCreateShiftTemplate() {
  const qc = useQueryClient();
  return useMutation<{ template: ShiftTemplate }, Error, CreateInput>({
    mutationFn: (input) =>
      mutateApi<{ template: ShiftTemplate }>("/api/roster/shift-templates", {
        method: "POST",
        body: input,
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["shift-templates", variables.serviceId] });
      toast({ description: "Template saved." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't save that template",
      });
    },
  });
}

export function useDeleteShiftTemplate() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean },
    Error,
    { id: string; serviceId: string }
  >({
    mutationFn: ({ id }) =>
      mutateApi<{ ok: boolean }>(`/api/roster/shift-templates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["shift-templates", variables.serviceId] });
      toast({ description: "Template deleted." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't delete that template",
      });
    },
  });
}
