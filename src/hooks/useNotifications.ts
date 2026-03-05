"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useDismissNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const res = await fetch("/api/notifications/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds }),
      });
      if (!res.ok) throw new Error("Failed to dismiss notifications");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
