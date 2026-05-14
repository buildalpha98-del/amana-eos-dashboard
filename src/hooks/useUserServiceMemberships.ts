"use client";

/**
 * useUserServiceMemberships — Teams "Assign to service" modal data source.
 *
 * Returns the user's primary service id + their active additional
 * memberships. The modal uses this to know which services are already
 * assigned (and should be pre-checked + disabled).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type {
  ServiceAccessLevel,
  ServiceMembershipStatus,
} from "./useServiceStaff";

export interface UserMembershipRow {
  id: string;
  serviceId: string;
  serviceName: string;
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
  startDate: string;
  endDate: string | null;
  status: ServiceMembershipStatus;
}

export interface UserServiceMembershipsResponse {
  primaryServiceId: string | null;
  memberships: UserMembershipRow[];
}

export function useUserServiceMemberships(userId: string | undefined) {
  return useQuery<UserServiceMembershipsResponse>({
    queryKey: ["user-service-memberships", userId],
    queryFn: () =>
      fetchApi<UserServiceMembershipsResponse>(
        `/api/users/${userId}/service-memberships`,
      ),
    enabled: !!userId,
    retry: 2,
    staleTime: 30_000,
  });
}

export interface BulkAssignItem {
  serviceId: string;
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
  startDate: string;
}

export interface BulkAssignResponse {
  created: Array<{ id: string; serviceId: string; reactivated?: boolean }>;
  skipped: Array<{
    serviceId: string;
    reason: "already_primary" | "already_assigned";
  }>;
}

export function useBulkAssignServices(userId: string) {
  const qc = useQueryClient();
  return useMutation<BulkAssignResponse, Error, { items: BulkAssignItem[] }>({
    mutationFn: (body) =>
      mutateApi<BulkAssignResponse>(
        `/api/users/${userId}/service-memberships`,
        {
          method: "POST",
          body,
        },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["user-service-memberships", userId],
      });
      // Invalidate any open service-staff list — the new assignments
      // will appear there.
      qc.invalidateQueries({ queryKey: ["service-staff"] });
      const n = data.created.length;
      const s = data.skipped.length;
      if (n > 0) {
        toast({
          description:
            s > 0
              ? `Assigned to ${n} service${n === 1 ? "" : "s"} (${s} skipped — already assigned)`
              : `Assigned to ${n} service${n === 1 ? "" : "s"}`,
        });
      } else if (s > 0) {
        toast({
          description: `All ${s} service${s === 1 ? "" : "s"} were already assigned`,
        });
      }
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to assign services",
      });
    },
  });
}
