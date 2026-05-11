"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

interface ResendResponse {
  ok: true;
  message: string;
}

interface BulkResendResponse {
  ok: true;
  message: string;
  resent: number;
  failed: number;
  failures: Array<{ email: string; error: string }>;
}

/**
 * Single-user resend-invite: admin-only, pending users only. Used from
 * the row action menu on /team.
 */
export function useEmployeeResendInvite(employeeId: string) {
  const qc = useQueryClient();
  return useMutation<ResendResponse, Error>({
    mutationFn: () =>
      mutateApi(`/api/employees/${employeeId}/resend-invite`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      toast({ description: data.message });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to resend invite",
      });
    },
  });
}

/**
 * Bulk resend-invite: admin-only. Re-issues invites for every pending
 * staff member. Drives the "Resend all pending (N)" button.
 */
export function useBulkResendInvite() {
  const qc = useQueryClient();
  return useMutation<BulkResendResponse, Error>({
    mutationFn: () =>
      mutateApi(`/api/users/bulk-resend-invite`, { method: "POST" }),
    onSuccess: (data) => {
      toast({
        description: data.message,
        variant: data.failed > 0 ? "destructive" : undefined,
      });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        description: err.message || "Bulk resend failed",
      });
    },
  });
}
