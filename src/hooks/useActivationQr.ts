import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface QrResponse {
  shortCode: string;
  scanUrl: string;
  svg: string;
}

export interface QrPatchResponse {
  id: string;
  shortCode: string | null;
  scanUrl: string | null;
  destinationUrl: string | null;
}

export interface QrStatsResponse {
  totals: {
    scans: number;
    uniqueVisitors: number;
    enquiries: number;
    enrolled: number;
    conversionRate: number;
  };
  timeline: Array<{ date: string; count: number }>;
  recentScans: Array<{ id: string; scannedAt: string; userAgent: string | null; referrer: string | null }>;
  recentEnquiries: Array<{ id: string; parentName: string; stage: string; createdAt: string }>;
}

const KEY_BASE = "activation-qr";
const STATS_KEY = "activation-qr-stats";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useActivationQr(activationId: string | null) {
  return useQuery<QrResponse>({
    queryKey: [KEY_BASE, activationId],
    queryFn: () => fetchApi<QrResponse>(`/api/marketing/activations/${activationId}/qr`),
    enabled: !!activationId,
    retry: 2,
    staleTime: 60_000,
  });
}

export function useActivationQrStats(activationId: string | null) {
  return useQuery<QrStatsResponse>({
    queryKey: [STATS_KEY, activationId],
    queryFn: () => fetchApi<QrStatsResponse>(`/api/marketing/activations/${activationId}/qr-stats`),
    enabled: !!activationId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface PatchQrInput {
  destinationUrl?: string | null;
  regenerate?: boolean;
}

export function usePatchActivationQr(activationId: string | null) {
  const qc = useQueryClient();
  return useMutation<QrPatchResponse, Error, PatchQrInput>({
    mutationFn: (input) =>
      mutateApi<QrPatchResponse>(`/api/marketing/activations/${activationId}/qr`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY_BASE, activationId] });
      qc.invalidateQueries({ queryKey: [STATS_KEY, activationId] });
    },
    onError: destructive,
  });
}
