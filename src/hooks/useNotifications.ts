"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface NotificationItem {
  id: string;
  type:
    | "overdue_todo"
    | "overdue_rock"
    | "unassigned_ticket"
    | "critical_issue"
    | "sla_warning"
    | "low_compliance"
    | "compliance_expiring"
    | "new_todo_assigned"
    | "new_issue_assigned"
    | "new_rock_assigned";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  link: string;
  timestamp: string;
  entityId: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  total: number;
  critical: number;
}

export function useNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => fetchApi<NotificationsResponse>("/api/notifications"),
    refetchInterval: 2 * 60_000, // 2 minutes
    retry: 2,
  });
}

export function useDismissNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      return mutateApi("/api/notifications/dismiss", {
        method: "POST",
        body: { notificationIds },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
