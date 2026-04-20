"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ParentNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: ParentNotificationItem[];
  unreadCount: number;
}

export function useParentNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ["parent-notifications"],
    queryFn: () => fetchApi<NotificationsResponse>("/api/parent/notifications"),
    staleTime: 15_000,
    refetchInterval: 30_000, // Poll every 30s for new notifications
    retry: 2,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { notificationIds?: string[]; markAllRead?: boolean }) =>
      mutateApi("/api/parent/notifications", { method: "PATCH", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-notifications"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
