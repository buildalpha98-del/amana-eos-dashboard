import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ActivationLifecycleStage, ActivationType } from "@prisma/client";

export interface ActivationTimestamps {
  conceptApprovedAt: string | null;
  logisticsStartedAt: string | null;
  finalPushStartedAt: string | null;
  activationDeliveredAt: string | null;
  recapPublishedAt: string | null;
  cancelledAt: string | null;
}

export interface ActivationRow {
  id: string;
  title: string;
  activationType: ActivationType | null;
  lifecycleStage: ActivationLifecycleStage;
  scheduledFor: string | null;
  daysUntilScheduled: number | null;
  daysSinceDelivered: number | null;
  expectedAttendance: number | null;
  actualAttendance: number | null;
  enquiriesGenerated: number | null;
  budget: number | null;
  notes: string | null;
  termYear: number | null;
  termNumber: number | null;
  timestamps: ActivationTimestamps;
  cancellationReason: string | null;
  campaign: { id: string; name: string; type: string; status: string; startDate: string | null; endDate: string | null };
  service: { id: string; name: string; code: string; state: string | null };
  coordinator: { id: string; name: string } | null;
  recapPostId: string | null;
  recapPostStatus: string | null;
  recapStatus: "not_due" | "due_soon" | "overdue" | "published";
}

export interface UnassignedCampaign {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface ActivationsResponse {
  activations: ActivationRow[];
  unassignedCampaigns: UnassignedCampaign[];
}

export type ActivationView = "in_flight" | "archive";

export interface ActivationsQuery {
  view?: ActivationView;
  serviceId?: string;
  campaignId?: string;
  termYear?: number;
  termNumber?: number;
}

const ACT_KEY = "marketing-activations";
const GRID_KEY = "marketing-activations-term-grid";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

function buildQuery(q: ActivationsQuery = {}): string {
  const parts: string[] = [];
  if (q.view) parts.push(`view=${q.view}`);
  if (q.serviceId) parts.push(`serviceId=${q.serviceId}`);
  if (q.campaignId) parts.push(`campaignId=${q.campaignId}`);
  if (q.termYear !== undefined) parts.push(`termYear=${q.termYear}`);
  if (q.termNumber !== undefined) parts.push(`termNumber=${q.termNumber}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function useActivations(query: ActivationsQuery = {}) {
  return useQuery<ActivationsResponse>({
    queryKey: [ACT_KEY, query.view ?? "all", query.serviceId ?? "*", query.campaignId ?? "*", query.termYear ?? "*", query.termNumber ?? "*"],
    queryFn: () => fetchApi<ActivationsResponse>(`/api/marketing/activations${buildQuery(query)}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface TermGridResponse {
  term: { year: number; number: number; startsOn: string; endsOn: string; weeksUntilEnd: number };
  centres: Array<{ id: string; name: string; state: string | null }>;
  matrix: Array<{
    serviceId: string;
    serviceName: string;
    state: string | null;
    code: string;
    activations: Array<{
      id: string;
      lifecycleStage: ActivationLifecycleStage;
      activationType: ActivationType | null;
      scheduledFor: string | null;
      campaignName: string;
      actualAttendance: number | null;
      expectedAttendance: number | null;
    }>;
    counts: { total: number; delivered: number; planned: number; cancelled: number };
    targetPerCentre: number;
    status: "green" | "amber" | "red";
  }>;
  termTotals: { total: number; delivered: number; target: number; floor: number };
}

export function useTermGrid(termYear?: number, termNumber?: number) {
  const qs = termYear && termNumber ? `?termYear=${termYear}&termNumber=${termNumber}` : "";
  return useQuery<TermGridResponse>({
    queryKey: [GRID_KEY, termYear ?? "current", termNumber ?? "current"],
    queryFn: () => fetchApi<TermGridResponse>(`/api/marketing/activations/term-grid${qs}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export interface CreateActivationInput {
  campaignId: string;
  serviceId: string;
  activationType?: ActivationType;
  scheduledFor?: string;
  expectedAttendance?: number;
  budget?: number;
  notes?: string;
}

export function useCreateActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActivationInput) =>
      mutateApi<ActivationRow>("/api/marketing/activations", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACT_KEY] });
      qc.invalidateQueries({ queryKey: [GRID_KEY] });
    },
    onError: destructive,
  });
}

export interface PatchActivationInput {
  id: string;
  activationType?: ActivationType | null;
  scheduledFor?: string | null;
  expectedAttendance?: number | null;
  actualAttendance?: number | null;
  enquiriesGenerated?: number | null;
  budget?: number | null;
  notes?: string | null;
  coordinatorId?: string | null;
}

export function usePatchActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: PatchActivationInput) =>
      mutateApi(`/api/marketing/activations/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACT_KEY] });
      qc.invalidateQueries({ queryKey: [GRID_KEY] });
    },
    onError: destructive,
  });
}

export interface TransitionInput {
  id: string;
  toStage: ActivationLifecycleStage;
  occurredAt?: string;
  notes?: string;
  actualAttendance?: number;
  enquiriesGenerated?: number;
  recapPostId?: string | null;
  cancellationReason?: string;
}

export function useTransitionActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TransitionInput) =>
      mutateApi(`/api/marketing/activations/${id}/transition`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACT_KEY] });
      qc.invalidateQueries({ queryKey: [GRID_KEY] });
    },
    onError: destructive,
  });
}

// Legacy Sprint 6 hook (still used by the previous mark-delivered button).
export function useMarkDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, undo }: { id: string; undo?: boolean }) =>
      mutateApi(`/api/marketing/activations/${id}/mark-delivered`, {
        method: "POST",
        body: { undo: undo ?? false },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACT_KEY] });
      qc.invalidateQueries({ queryKey: [GRID_KEY] });
    },
    onError: destructive,
  });
}
