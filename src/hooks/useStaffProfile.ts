"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type {
  VisaStatus,
  EmploymentType,
  QualificationType,
} from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffQualification {
  id: string;
  userId: string;
  type: QualificationType;
  name: string;
  institution: string | null;
  completedDate: string | null;
  expiryDate: string | null;
  certificateUrl: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  active: boolean;
  serviceId: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  addressStreet: string | null;
  addressSuburb: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  taxFileNumber: string | null;
  superFundName: string | null;
  superMemberNumber: string | null;
  superUSI: string | null;
  visaStatus: VisaStatus | null;
  visaExpiry: string | null;
  employmentType: EmploymentType | null;
  startDate: string | null;
  probationEndDate: string | null;
  bankDetailsNote: string | null;
  xeroEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  emergencyContacts: EmergencyContact[];
  qualifications: StaffQualification[];
}

// ── Profile Hooks ────────────────────────────────────────────────────────────

export function useStaffProfile(userId: string) {
  return useQuery<StaffProfile>({
    queryKey: ["staff-profile", userId],
    queryFn: async () => {
      return fetchApi<StaffProfile>(`/api/users/${userId}/profile`);
    },
    enabled: !!userId,
    retry: 2,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...data
    }: {
      userId: string;
      phone?: string;
      dateOfBirth?: string;
      addressStreet?: string;
      addressSuburb?: string;
      addressState?: string;
      addressPostcode?: string;
      taxFileNumber?: string;
      superFundName?: string;
      superMemberNumber?: string;
      superUSI?: string;
      visaStatus?: VisaStatus;
      visaExpiry?: string;
      employmentType?: EmploymentType;
      startDate?: string;
      probationEndDate?: string;
      bankDetailsNote?: string;
      xeroEmployeeId?: string;
    }) => {
      return mutateApi(`/api/users/${userId}/profile`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Emergency Contact Hooks ──────────────────────────────────────────────────

export function useCreateEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...data
    }: {
      userId: string;
      name: string;
      phone: string;
      relationship: string;
      isPrimary?: boolean;
    }) => {
      return mutateApi(`/api/users/${userId}/emergency-contacts`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      phone?: string;
      relationship?: string;
      isPrimary?: boolean;
    }) => {
      return mutateApi(`/api/emergency-contacts/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/emergency-contacts/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Qualification Hooks ──────────────────────────────────────────────────────

export function useCreateQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...data
    }: {
      userId: string;
      type: QualificationType;
      name: string;
      institution?: string;
      completedDate?: string;
      expiryDate?: string;
      certificateUrl?: string;
      verified?: boolean;
    }) => {
      return mutateApi(`/api/users/${userId}/qualifications`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      type?: QualificationType;
      name?: string;
      institution?: string | null;
      completedDate?: string | null;
      expiryDate?: string | null;
      certificateUrl?: string | null;
      verified?: boolean;
    }) => {
      return mutateApi(`/api/qualifications/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/qualifications/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
