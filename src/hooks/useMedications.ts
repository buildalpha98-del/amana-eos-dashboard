"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { offlineQueue } from "@/lib/offline-queue";

export type MedicationRoute =
  | "oral"
  | "topical"
  | "inhaled"
  | "injection"
  | "other";

export interface MedicationDose {
  id: string;
  childId: string;
  serviceId: string;
  medicationName: string;
  dose: string;
  route: MedicationRoute;
  administeredAt: string;
  administeredById: string;
  witnessedById: string | null;
  parentConsentUrl: string | null;
  notes: string | null;
  clientMutationId: string;
  createdAt: string;
  administeredBy: { id: string; name: string; avatar: string | null };
  witnessedBy: { id: string; name: string; avatar: string | null } | null;
  child: { id: string; firstName: string; surname: string };
}

interface Listing {
  items: MedicationDose[];
  date: string;
}

export function useMedications(
  serviceId: string | undefined,
  filters?: { date?: string; childId?: string },
) {
  const qs = new URLSearchParams();
  if (filters?.date) qs.set("date", filters.date);
  if (filters?.childId) qs.set("childId", filters.childId);

  return useQuery<Listing>({
    queryKey: ["medications", serviceId, filters?.date, filters?.childId],
    queryFn: () =>
      fetchApi<Listing>(`/api/services/${serviceId}/medications?${qs.toString()}`),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface LogDoseArgs {
  childId: string;
  medicationName: string;
  dose: string;
  route: MedicationRoute;
  administeredAt: string;
  witnessedById?: string | null;
  parentConsentUrl?: string;
  notes?: string;
  clientMutationId: string;
}

export function useLogDose(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<MedicationDose | { queued: true }, Error, LogDoseArgs>({
    mutationFn: async (body) => {
      const url = `/api/services/${serviceId}/medications`;
      try {
        return await mutateApi<MedicationDose>(url, { method: "POST", body });
      } catch (err) {
        // Network error or 5xx — enqueue for later drain.
        // 4xx bubbles up untouched (user input is wrong, no point queuing).
        const msg = err instanceof Error ? err.message : "";
        const isTransient =
          msg.includes("NetworkError") ||
          msg.toLowerCase().includes("failed to fetch") ||
          msg.startsWith("HTTP 5");
        if (!isTransient) throw err;
        await offlineQueue.enqueue({
          id: body.clientMutationId,
          url,
          method: "POST",
          body: body as unknown as Record<string, unknown>,
        });
        toast({
          description: "Dose saved offline — will sync when you're back online.",
        });
        return { queued: true as const };
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medications", serviceId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to log dose",
      });
    },
  });
}
