"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      const res = await fetch(`/api/users/${userId}/profile`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!userId,
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
      const res = await fetch(`/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
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
      const res = await fetch(`/api/users/${userId}/emergency-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create emergency contact");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
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
      const res = await fetch(`/api/emergency-contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update emergency contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
  });
}

export function useDeleteEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/emergency-contacts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete emergency contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
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
      const res = await fetch(`/api/users/${userId}/qualifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create qualification");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["staff-profile", variables.userId],
      });
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
      const res = await fetch(`/api/qualifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update qualification");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
  });
}

export function useDeleteQualification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/qualifications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete qualification");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
    },
  });
}
