import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface QrCodeRow {
  id: string;
  shortCode: string;
  name: string;
  description: string | null;
  destinationUrl: string;
  active: boolean;
  scanUrl: string;
  totals: { scans: number; uniqueVisitors: number };
  activation: { id: string; label: string } | null;
  service: { id: string; name: string; code: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface QrCodeListResponse {
  baseUrl: string;
  codes: QrCodeRow[];
}

export interface QrCodeDetail {
  id: string;
  shortCode: string;
  scanUrl: string;
  svg: string;
  name: string;
  description: string | null;
  destinationUrl: string;
  active: boolean;
  activation: { id: string; label: string } | null;
  service: { id: string; name: string; code: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  totals: { scans: number; uniqueVisitors: number };
  timeline: Array<{ date: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  countryCounts: Array<{ country: string; count: number }>;
  recentScans: Array<{
    id: string;
    scannedAt: string;
    userAgent: string | null;
    referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
  }>;
}

const LIST_KEY = "marketing-qr-codes";
const DETAIL_KEY = "marketing-qr-code-detail";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export interface QrListQuery {
  active?: "true" | "false" | "all";
  serviceId?: string;
  activationId?: string;
  search?: string;
}

function buildQuery(q: QrListQuery): string {
  const parts: string[] = [];
  if (q.active) parts.push(`active=${q.active}`);
  if (q.serviceId) parts.push(`serviceId=${q.serviceId}`);
  if (q.activationId) parts.push(`activationId=${q.activationId}`);
  if (q.search) parts.push(`search=${encodeURIComponent(q.search)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function useQrCodes(query: QrListQuery = {}) {
  return useQuery<QrCodeListResponse>({
    queryKey: [LIST_KEY, query.active ?? "true", query.serviceId ?? "*", query.activationId ?? "*", query.search ?? ""],
    queryFn: () => fetchApi<QrCodeListResponse>(`/api/marketing/qr-codes${buildQuery(query)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useQrCodeDetail(id: string | null) {
  return useQuery<QrCodeDetail>({
    queryKey: [DETAIL_KEY, id],
    queryFn: () => fetchApi<QrCodeDetail>(`/api/marketing/qr-codes/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 15_000,
  });
}

export interface CreateQrInput {
  name: string;
  description?: string;
  destinationUrl: string;
  activationId?: string;
  serviceId?: string;
}

export function useCreateQrCode() {
  const qc = useQueryClient();
  return useMutation<{ id: string; shortCode: string; scanUrl: string; name: string; destinationUrl: string; active: boolean }, Error, CreateQrInput>({
    mutationFn: (input) =>
      mutateApi("/api/marketing/qr-codes", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
    },
    onError: destructive,
  });
}

export interface PatchQrInput {
  id: string;
  name?: string;
  description?: string | null;
  destinationUrl?: string;
  active?: boolean;
  regenerate?: boolean;
}

export function usePatchQrCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: PatchQrInput) =>
      mutateApi(`/api/marketing/qr-codes/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, vars.id] });
    },
    onError: destructive,
  });
}

export function useArchiveQrCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/marketing/qr-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIST_KEY] }),
    onError: destructive,
  });
}
