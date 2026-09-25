"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export type QuickActionType =
  | "reset_password"
  | "trigger_onboarding"
  | "toggle_admin"
  | "toggle_active"
  | "toggle_hr_warnings_muted";

interface QuickActionResponse {
  ok: true;
  message: string;
  newRole?: string;
  newActive?: boolean;
  newHrWarningsMuted?: boolean;
}

/**
 * Whether a SeparationRecord exists for this employee. Fetched lazily
 * (pass `enabled` only while a deactivate confirm is open) so the /team
 * list never pays N requests up front. Admin-tier only — the endpoint
 * 403s below that, which is fine because the deactivate action that
 * needs this is admin-only too.
 */
export function useEmployeeHasSeparation(employeeId: string, enabled: boolean) {
  return useQuery<{ hasSeparation: boolean }>({
    queryKey: ["employee-has-separation", employeeId],
    queryFn: () =>
      fetchApi<{ hasSeparation: boolean }>(
        `/api/employees/${employeeId}/quick-action`,
      ),
    enabled,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useEmployeeQuickAction(employeeId: string) {
  const qc = useQueryClient();
  return useMutation<QuickActionResponse, Error, QuickActionType>({
    mutationFn: (action) =>
      mutateApi(`/api/employees/${employeeId}/quick-action`, {
        method: "POST",
        body: { action },
      }),
    onSuccess: (data) => {
      toast({ description: data.message });
      // "employees-list" — the key useEmployeesList actually registers
      // under. "employees" was a stale key from before the Teams tab
      // redesign; it never matched anything, so every quick action here
      // (deactivate, toggle admin, this mute toggle) silently required a
      // manual page reload to show up in the /team table.
      qc.invalidateQueries({ queryKey: ["employees-list"] });
      qc.invalidateQueries({ queryKey: ["staff", employeeId] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Action failed",
      });
    },
  });
}
