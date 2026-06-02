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
  // 2026-06-02: server renamed `error` → `reason` so the field name
  // matches the structured outcome (suppressed / not_configured /
  // send_failed) the bulk route now reports.
  failures: Array<{ email: string; reason: string }>;
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
      if (data.failed > 0) {
        // Spell out who failed and why — the bare summary ("Resent X,
        // 1 failed") leaves admin chasing logs to find the recipient.
        // Cap at 5 lines so a 50-failure batch doesn't blow the toast.
        const shown = data.failures.slice(0, 5);
        const lines = shown.map((f) => `• ${f.email} — ${f.reason}`);
        if (data.failures.length > shown.length) {
          lines.push(`…and ${data.failures.length - shown.length} more.`);
        }
        toast({
          variant: "destructive",
          description: `${data.message}\n\n${lines.join("\n")}`,
        });
      } else {
        toast({ description: data.message });
      }
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
