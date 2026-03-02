"use client";
import { useQuery } from "@tanstack/react-query";

export interface NotificationItem {
  id: string;
  type:
    | "overdue_todo"
    | "overdue_rock"
    | "unassigned_ticket"
    | "critical_issue"
    | "sla_warning"
    | "low_compliance";
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
