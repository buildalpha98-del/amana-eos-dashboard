"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  VendorBriefStatus,
  VendorBriefType,
  TermReadinessCategory,
} from "@prisma/client";
import type { SlaState } from "@/lib/vendor-brief/sla";

// ---------------------------------------------------------------------------
// Types — mirrors the route response shape
// ---------------------------------------------------------------------------

export interface VendorBriefListItem {
  id: string;
  briefNumber: string;
  title: string;
  type: VendorBriefType;
  status: VendorBriefStatus;
  serviceId: string | null;
  serviceName: string | null;
  vendorContactId: string | null;
  vendorContactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  termYear: number | null;
  termNumber: number | null;
  termReadinessCategory: TermReadinessCategory | null;
  briefSentAt: string | null;
  acknowledgedAt: string | null;
  quoteReceivedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  installedAt: string | null;
  deliveryDeadline: string | null;
  targetTermStart: string | null;
  escalatedAt: string | null;
  escalatedToUserId: string | null;
  slaState: SlaState;
  createdAt: string;
  updatedAt: string;
}

export interface VendorBriefDetail extends VendorBriefListItem {
  briefBody: string | null;
  specifications: string | null;
  quantity: number | null;
  deliveryAddress: string | null;
  notes: string | null;
  cancellationReason: string | null;
  escalationReason: string | null;
  vendorName: string | null;
}

export interface TermReadinessResponse {
  term: {
    year: number;
    number: number;
    startsOn: string | null;
    weeksUntil: number | null;
  };
  centres: Array<{ id: string; name: string; state: string | null }>;
  categories: TermReadinessCategory[];
  matrix: Array<{
    serviceId: string | null;
    category: TermReadinessCategory | null;
    brief: VendorBriefListItem;
  }>;
}

const onMutationError = (err: Error) =>
  toast({
    variant: "destructive",
    description: err.message || "Something went wrong",
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

type ListFilter = {
  status?: "in_flight" | "archived" | VendorBriefStatus;
  serviceId?: string;
  termYear?: number;
  termNumber?: number;
  termReadinessCategory?: TermReadinessCategory;
};

export function useVendorBriefs(filter: ListFilter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.serviceId) params.set("serviceId", filter.serviceId);
  if (filter.termYear) params.set("termYear", String(filter.termYear));
  if (filter.termNumber) params.set("termNumber", String(filter.termNumber));
  if (filter.termReadinessCategory)
    params.set("termReadinessCategory", filter.termReadinessCategory);
  const qs = params.toString();

  return useQuery({
    queryKey: [
      "vendor-briefs",
      filter.status ?? null,
      filter.serviceId ?? null,
      filter.termYear ?? null,
      filter.termNumber ?? null,
      filter.termReadinessCategory ?? null,
    ],
    queryFn: () =>
      fetchApi<{ briefs: VendorBriefListItem[]; nextCursor: string | null }>(
        `/api/marketing/vendor-briefs${qs ? `?${qs}` : ""}`,
      ).then((r) => r.briefs),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useVendorBrief(id: string | null | undefined) {
  return useQuery({
    queryKey: ["vendor-brief", id],
    enabled: !!id,
    queryFn: () =>
      fetchApi<{ brief: VendorBriefDetail }>(
        `/api/marketing/vendor-briefs/${id}`,
      ).then((r) => r.brief),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useTermReadiness(termYear: number | null, termNumber: number | null) {
  return useQuery({
    queryKey: ["vendor-briefs", "term-readiness", termYear, termNumber],
    enabled: !!(termYear && termNumber),
    queryFn: () =>
      fetchApi<TermReadinessResponse>(
        `/api/marketing/vendor-briefs/term-readiness?termYear=${termYear}&termNumber=${termNumber}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateBriefInput {
  title: string;
  type: VendorBriefType;
  serviceId?: string | null;
  vendorContactId?: string | null;
  briefBody?: string;
  specifications?: string;
  quantity?: number;
  deliveryAddress?: string;
  deliveryDeadline?: string;
  targetTermStart?: string;
  termYear?: number;
  termNumber?: number;
  termReadinessCategory?: TermReadinessCategory;
}

export function useCreateVendorBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBriefInput) =>
      mutateApi<{ brief: VendorBriefListItem }>(
        "/api/marketing/vendor-briefs",
        { method: "POST", body: input as unknown as Record<string, unknown> },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

export interface PatchBriefInput {
  id: string;
  title?: string;
  type?: VendorBriefType;
  serviceId?: string | null;
  vendorContactId?: string | null;
  briefBody?: string | null;
  specifications?: string | null;
  quantity?: number | null;
  deliveryAddress?: string | null;
  deliveryDeadline?: string | null;
  targetTermStart?: string | null;
  termYear?: number | null;
  termNumber?: number | null;
  termReadinessCategory?: TermReadinessCategory | null;
  notes?: string | null;
}

export function usePatchVendorBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PatchBriefInput) =>
      mutateApi<{ brief: VendorBriefListItem }>(
        `/api/marketing/vendor-briefs/${id}`,
        { method: "PATCH", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["vendor-brief", v.id] });
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

export function useTransitionVendorBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      toStatus: VendorBriefStatus;
      occurredAt?: string;
      notes?: string;
    }) =>
      mutateApi<{ brief: VendorBriefListItem }>(
        `/api/marketing/vendor-briefs/${id}/transition`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["vendor-brief", v.id] });
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

export function useEscalateVendorBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      reason: string;
      escalatedToUserId?: string;
    }) =>
      mutateApi<{ brief: VendorBriefListItem }>(
        `/api/marketing/vendor-briefs/${id}/escalate`,
        { method: "POST", body },
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["vendor-brief", v.id] });
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

export function useClearEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ brief: VendorBriefListItem }>(
        `/api/marketing/vendor-briefs/${id}/clear-escalation`,
        { method: "POST" },
      ),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["vendor-brief", id] });
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

export function useSeedTermReadiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      termYear: number;
      termNumber: number;
      categories?: TermReadinessCategory[];
      centreIds?: string[];
    }) =>
      mutateApi<{ created: number; skipped: number; ids: string[] }>(
        "/api/marketing/vendor-briefs/term-readiness/seed",
        { method: "POST", body: body as unknown as Record<string, unknown> },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-briefs"] });
    },
    onError: onMutationError,
  });
}

// Vendor contact list for the brief form's contact dropdown.
export interface VendorContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  defaultForTypes: VendorBriefType[];
}

export function useVendorContacts() {
  return useQuery({
    queryKey: ["vendor-contacts"],
    queryFn: () =>
      fetchApi<{ contacts: VendorContact[] }>(
        "/api/marketing/vendor-contacts",
      ).then((r) => r.contacts),
    retry: 2,
    staleTime: 5 * 60_000, // 5 min — vendor contacts change rarely
  });
}
