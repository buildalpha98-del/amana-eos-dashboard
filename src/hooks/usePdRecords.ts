"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface PdRecord {
  id: string;
  userId: string;
  title: string;
  type: string; // "course" | "workshop" | "conference" | ...
  hours: number;
  completedAt: string;
  provider: string | null;
  attachmentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function usePdRecords(userId: string | null) {
  return useQuery<PdRecord[]>({
    queryKey: ["pd-records", userId],
    queryFn: () => fetchApi<PdRecord[]>(`/api/users/${userId}/pd-log`),
    enabled: Boolean(userId),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreatePdInput {
  userId: string;
  title: string;
  type: string;
  hours: number;
  completedAt: string; // ISO
  provider?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
}

export function useCreatePdRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...data }: CreatePdInput) => {
      return mutateApi<PdRecord>(`/api/users/${userId}/pd-log`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pd-records", vars.userId] });
      toast({ description: "PD record added" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to add PD record",
      });
    },
  });
}

export function useDeletePdRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      recordId,
    }: {
      userId: string;
      recordId: string;
    }) => {
      return mutateApi<{ ok: boolean }>(
        `/api/users/${userId}/pd-log/${recordId}`,
        { method: "DELETE" },
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pd-records", vars.userId] });
      toast({ description: "PD record deleted" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to delete PD record",
      });
    },
  });
}
