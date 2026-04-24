"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

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
  return useMutation<MedicationDose, Error, LogDoseArgs>({
    mutationFn: (body) =>
      mutateApi<MedicationDose>(`/api/services/${serviceId}/medications`, {
        method: "POST",
        body,
      }),
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
