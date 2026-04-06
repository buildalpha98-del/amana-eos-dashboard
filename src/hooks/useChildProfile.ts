"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

// ── Medical & Dietary ────────────────────────────────────────

export interface ChildMedical {
  id: string;
  firstName: string;
  surname: string;
  medicalConditions: string[];
  medicationDetails: string | null;
  anaphylaxisActionPlan: boolean;
  dietaryRequirements: string[];
  additionalNeeds: string | null;
  serviceId: string | null;
  availableConditions: string[];
  availableDietary: string[];
}

export function useChildMedical(childId: string | null) {
  return useQuery<ChildMedical>({
    queryKey: ["child-medical", childId],
    queryFn: () => fetchApi<ChildMedical>(`/api/children/${childId}/medical`),
    enabled: Boolean(childId),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUpdateChildMedical() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      childId,
      ...data
    }: {
      childId: string;
      medicalConditions?: string[];
      medicationDetails?: string | null;
      anaphylaxisActionPlan?: boolean;
      dietaryRequirements?: string[];
      additionalNeeds?: string | null;
    }) => {
      return mutateApi<ChildMedical>(`/api/children/${childId}/medical`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["child-medical", vars.childId] });
      qc.invalidateQueries({ queryKey: ["child", vars.childId] });
      qc.invalidateQueries({ queryKey: ["children"] });
      toast({ description: "Medical & dietary info updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Authorised Pickups ───────────────────────────────────────

export interface AuthorisedPickup {
  id: string;
  childId: string;
  name: string;
  relationship: string;
  phone: string;
  photoId: string | null;
  isEmergencyContact: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useChildPickups(childId: string | null) {
  return useQuery<{ pickups: AuthorisedPickup[] }>({
    queryKey: ["child-pickups", childId],
    queryFn: () => fetchApi<{ pickups: AuthorisedPickup[] }>(`/api/children/${childId}/authorised-pickups`),
    enabled: Boolean(childId),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useAddChildPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      childId,
      ...data
    }: {
      childId: string;
      name: string;
      relationship: string;
      phone: string;
      photoId?: string | null;
      isEmergencyContact?: boolean;
    }) => {
      return mutateApi<AuthorisedPickup>(`/api/children/${childId}/authorised-pickups`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["child-pickups", vars.childId] });
      toast({ description: "Authorised pickup added" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteChildPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, pickupId }: { childId: string; pickupId: string }) => {
      return mutateApi(`/api/children/${childId}/authorised-pickups/${pickupId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["child-pickups", vars.childId] });
      toast({ description: "Authorised pickup removed" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Documents ────────────────────────────────────────────────

export interface ChildDocument {
  id: string;
  childId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export function useChildDocuments(childId: string | null) {
  return useQuery<{ documents: ChildDocument[] }>({
    queryKey: ["child-documents", childId],
    queryFn: () => fetchApi<{ documents: ChildDocument[] }>(`/api/children/${childId}/documents`),
    enabled: Boolean(childId),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUploadChildDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, file, documentType }: { childId: string; file: File; documentType: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);

      const res = await fetch(`/api/children/${childId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      return res.json() as Promise<ChildDocument>;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["child-documents", vars.childId] });
      toast({ description: "Document uploaded" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteChildDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, documentId }: { childId: string; documentId: string }) => {
      return mutateApi(`/api/children/${childId}/documents/${documentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["child-documents", vars.childId] });
      toast({ description: "Document deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
