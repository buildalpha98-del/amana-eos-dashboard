"use client";

/**
 * useServiceStaff — staff list + CRUD for the per-service Staff tab.
 *
 * Unified shape: primary users (User.serviceId === serviceId) AND active
 * UserServiceMembership rows are merged server-side into a single
 * `members` array. Primary rows surface with `isPrimary: true` and
 * `membership.id === null`; their roleAtService/accessLevel/startDate
 * are derived from the user's global Role (see deriveMembershipDefaults).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { Role } from "@prisma/client";

export type ServiceAccessLevel = "view_only" | "contributor" | "admin";
export type ServiceMembershipStatus = "active" | "inactive";

export interface ServiceStaffMember {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: Role;
  isPrimary: boolean;
  isActive: boolean;
  membership: {
    id: string | null;
    roleAtService: string;
    accessLevel: ServiceAccessLevel;
    startDate: string;
    endDate: string | null;
    status: ServiceMembershipStatus;
  };
}

interface Listing {
  members: ServiceStaffMember[];
}

export function useServiceStaff(serviceId: string | undefined) {
  return useQuery<Listing>({
    queryKey: ["service-staff", serviceId],
    queryFn: () =>
      fetchApi<Listing>(`/api/services/${serviceId}/staff`),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface AddServiceStaffArgs {
  userId: string;
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
  startDate: string;
}

export function useAddServiceStaff(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, AddServiceStaffArgs>({
    mutationFn: (body) =>
      mutateApi(`/api/services/${serviceId}/staff`, {
        method: "POST",
        body,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      const reactivated =
        typeof data === "object" &&
        data !== null &&
        (data as { reactivated?: boolean }).reactivated === true;
      toast({
        description: reactivated
          ? "Staff member re-added to this service"
          : "Staff member added",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to add staff member",
      });
    },
  });
}

export interface UpdateServiceStaffArgs {
  membershipId: string;
  roleAtService?: string;
  accessLevel?: ServiceAccessLevel;
  startDate?: string;
  endDate?: string | null;
  status?: ServiceMembershipStatus;
}

export function useUpdateServiceStaff(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, UpdateServiceStaffArgs>({
    mutationFn: ({ membershipId, ...body }) =>
      mutateApi(`/api/services/${serviceId}/staff/${membershipId}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      toast({ description: "Assignment updated" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to update assignment",
      });
    },
  });
}

export function useRemoveServiceStaff(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { membershipId: string }>({
    mutationFn: ({ membershipId }) =>
      mutateApi(`/api/services/${serviceId}/staff/${membershipId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-staff", serviceId] });
      toast({ description: "Staff member removed" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to remove staff member",
      });
    },
  });
}
