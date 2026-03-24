"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface WaitlistEntry {
  id: string;
  parentName: string;
  parentEmail: string | null;
  childName: string | null;
  serviceId: string;
  service?: { id: string; name: string; code: string };
  stage: string;
  waitlistPosition: number | null;
  waitlistOfferedAt: string | null;
  stageChangedAt: string;
  createdAt: string;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
  total: number;
}

interface OfferSpotResponse {
  id: string;
  parentName: string;
  waitlistOfferedAt: string;
}

/**
 * Fetch waitlisted enquiries, optionally filtered by service and status.
 */
export function useWaitlist(serviceId?: string, status?: string) {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = `/api/waitlist${qs ? `?${qs}` : ""}`;

  return useQuery<WaitlistResponse>({
    queryKey: ["waitlist", serviceId, status],
    queryFn: () => fetchApi<WaitlistResponse>(url),
    staleTime: 30_000,
    retry: 2,
  });
}

/**
 * Offer the next available spot to the first family on the waitlist for a service.
 */
export function useOfferSpot() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (serviceId: string) =>
      mutateApi<OfferSpotResponse>("/api/waitlist/offer-spot", {
        method: "POST",
        body: { serviceId },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      toast({
        description: `Spot offered to ${data.parentName}`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to offer spot",
      });
    },
  });
}

/**
 * Reorder the waitlist for a service.
 */
export function useReorderWaitlist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      orderedIds,
    }: {
      serviceId: string;
      orderedIds: string[];
    }) =>
      mutateApi("/api/waitlist/reorder", {
        method: "POST",
        body: { serviceId, orderedIds },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      toast({ description: "Waitlist order updated" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to reorder waitlist",
      });
    },
  });
}
