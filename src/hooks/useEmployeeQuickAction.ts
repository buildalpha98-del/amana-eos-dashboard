"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

export type QuickActionType =
  | "reset_password"
  | "trigger_onboarding"
  | "toggle_admin"
  | "toggle_active";

interface QuickActionResponse {
  ok: true;
  message: string;
  newRole?: string;
  newActive?: boolean;
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
      qc.invalidateQueries({ queryKey: ["employees"] });
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
