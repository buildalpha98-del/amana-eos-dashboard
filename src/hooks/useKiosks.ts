"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface KioskRow {
  id: string;
  serviceId: string;
  label: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  service?: { id: string; name: string; code: string } | null;
  createdBy?: { id: string; name: string } | null;
}

export function useKiosks(serviceId?: string) {
  const qs = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : "";
  return useQuery<{ kiosks: KioskRow[] }>({
    queryKey: ["kiosks", serviceId ?? null],
    queryFn: () => fetchApi<{ kiosks: KioskRow[] }>(`/api/kiosks${qs}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useRegisterKiosk() {
  const qc = useQueryClient();
  return useMutation<
    { kiosk: KioskRow; token: string },
    Error,
    { serviceId: string; label: string }
  >({
    mutationFn: (body) =>
      mutateApi<{ kiosk: KioskRow; token: string }>(`/api/kiosks`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiosks"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't register kiosk",
      });
    },
  });
}

export function useRevokeKiosk() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { id: string }>({
    mutationFn: ({ id }) =>
      mutateApi<{ ok: true }>(`/api/kiosks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiosks"] });
      toast({ description: "Kiosk revoked." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't revoke kiosk",
      });
    },
  });
}
