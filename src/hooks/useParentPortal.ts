"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ────────────────────────────────────────────────

export interface ParentProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: {
    street: string;
    suburb: string;
    state: string;
    postcode: string;
  } | null;
  children: ParentChild[];
  emergencyContacts: EmergencyContact[];
}

export interface ParentChild {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  yearLevel: string | null;
  serviceName: string;
  serviceId: string;
  medicalConditions: string[];
  allergies: string[];
  medications: string[];
  immunisationStatus: string | null;
  emergencyContacts: EmergencyContact[];
  attendanceThisWeek: {
    attended: number;
    total: number;
  };
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface AttendanceDay {
  date: string;
  status: "present" | "absent" | "no_session";
  signInTime: string | null;
  signOutTime: string | null;
}

export interface UpdateAccountPayload {
  phone?: string;
  address?: {
    street: string;
    suburb: string;
    state: string;
    postcode: string;
  };
  emergencyContacts?: {
    id?: string;
    name: string;
    phone: string;
    relationship: string;
  }[];
}

// ── Hooks ────────────────────────────────────────────────

export function useParentProfile() {
  return useQuery<ParentProfile>({
    queryKey: ["parent", "profile"],
    queryFn: () => fetchApi<ParentProfile>("/api/parent/me"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useParentChildren() {
  return useQuery<ParentChild[]>({
    queryKey: ["parent", "children"],
    queryFn: () => fetchApi<ParentChild[]>("/api/parent/children"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useChildAttendance(childId: string) {
  return useQuery<AttendanceDay[]>({
    queryKey: ["parent", "children", childId, "attendance"],
    queryFn: () =>
      fetchApi<AttendanceDay[]>(
        `/api/parent/children/${childId}/attendance`
      ),
    retry: 2,
    staleTime: 30_000,
    enabled: !!childId,
  });
}

export function useUpdateParentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateAccountPayload) =>
      mutateApi("/api/parent/account", {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent"] });
      toast({ description: "Account details updated successfully" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}
