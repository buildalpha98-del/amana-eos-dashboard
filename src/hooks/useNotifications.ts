"use client";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

/**
 * A single user-facing notification (mirrors the `UserNotification` model).
 * The `type` field is an open string because notification types are centralised
 * in `src/lib/notification-types.ts` and grow over time.
 */
export interface UserNotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: UserNotificationItem[];
  /** Cursor for the next page, or null when there are no more rows. */
  nextCursor?: string | null;
}

export interface UnreadCountResponse {
  count: number;
}

/** Fetch the current user's notifications. Pass `unread: true` to filter. */
export function useNotifications(options?: { unread?: boolean; enabled?: boolean }) {
  const unread = options?.unread ?? false;
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications", unread],
    queryFn: () =>
      fetchApi<NotificationsResponse>(
        unread ? "/api/notifications?unread=true" : "/api/notifications",
      ),
    retry: 2,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Cursor-paginated notifications for the full-page inbox. Each page carries
 * `nextCursor` (null on the last page); "Load more" calls `fetchNextPage`.
 */
export function useInfiniteNotifications(options?: {
  unread?: boolean;
  limit?: number;
  enabled?: boolean;
}) {
  const unread = options?.unread ?? false;
  const limit = options?.limit ?? 20;
  return useInfiniteQuery<NotificationsResponse>({
    queryKey: ["notifications", "infinite", unread, limit],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (unread) params.set("unread", "true");
      params.set("limit", String(limit));
      if (typeof pageParam === "string") params.set("cursor", pageParam);
      return fetchApi<NotificationsResponse>(
        `/api/notifications?${params.toString()}`,
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    retry: 2,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

/** Fetch just the unread count. Cheap endpoint suitable for polling. */
export function useUnreadNotificationCount(options?: { refetchInterval?: number }) {
  return useQuery<UnreadCountResponse>({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchApi<UnreadCountResponse>("/api/notifications/unread-count"),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval,
  });
}

/** Mark a single notification as read. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) =>
      mutateApi(`/api/notifications/${notificationId}/mark-read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Mark all of the current user's notifications as read. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      mutateApi("/api/notifications/mark-all-read", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
