"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ──────────────────────────────────────────────────

export interface ConversationListItem {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  family: { id: string; firstName: string | null; lastName: string | null };
  service: { id: string; name: string };
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  body: string;
  attachmentUrls: string[];
  senderType: "staff" | "parent";
  senderId: string;
  senderName: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  family: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  service: { id: string; name: string };
  messages: MessageItem[];
}

export interface BroadcastItem {
  id: string;
  serviceId: string;
  subject: string;
  body: string;
  sentByName: string;
  recipientCount: number;
  sentAt: string;
  service: { id: string; name: string };
}

// ── Conversations ──────────────────────────────────────────

export function useConversations(filters?: {
  serviceId?: string;
  status?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();

  return useQuery<ConversationListItem[]>({
    queryKey: ["messaging", "conversations", filters?.serviceId, filters?.status, filters?.search],
    queryFn: () =>
      fetchApi<ConversationListItem[]>(
        `/api/messaging/conversations${qs ? `?${qs}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useConversationDetail(id: string | null) {
  return useQuery<ConversationDetail>({
    queryKey: ["messaging", "conversation", id],
    queryFn: () => fetchApi<ConversationDetail>(`/api/messaging/conversations/${id}`),
    retry: 2,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      familyId: string;
      serviceId: string;
      subject: string;
      body: string;
      attachmentUrls?: string[];
    }) =>
      mutateApi<ConversationDetail>("/api/messaging/conversations", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messaging", "conversations"] });
      toast({ description: "Message sent" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string; attachmentUrls?: string[] }) =>
      mutateApi<MessageItem>(
        `/api/messaging/conversations/${conversationId}/messages`,
        { method: "POST", body: payload },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["messaging", "conversation", conversationId],
      });
      qc.invalidateQueries({ queryKey: ["messaging", "conversations"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateConversationStatus(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "resolved" | "archived") =>
      mutateApi(`/api/messaging/conversations/${conversationId}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messaging"] });
      toast({ description: "Conversation updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Broadcasts ─────────────────────────────────────────────

export function useBroadcasts(serviceId?: string) {
  return useQuery<BroadcastItem[]>({
    queryKey: ["messaging", "broadcasts", serviceId],
    queryFn: () =>
      fetchApi<BroadcastItem[]>(
        `/api/messaging/broadcasts${serviceId ? `?serviceId=${serviceId}` : ""}`,
      ),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useSendBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { serviceId: string; subject: string; body: string }) =>
      mutateApi<BroadcastItem>("/api/messaging/broadcasts", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["messaging", "broadcasts"] });
      toast({ description: `Broadcast sent to ${data.recipientCount} families` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Families (for compose dialog) ──────────────────────────

export interface FamilyOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  serviceId: string;
  service: { id: string; name: string };
}

export function useFamilies(serviceId?: string) {
  return useQuery<FamilyOption[]>({
    queryKey: ["messaging", "families", serviceId],
    queryFn: () =>
      fetchApi<FamilyOption[]>(
        `/api/messaging/families${serviceId ? `?serviceId=${serviceId}` : ""}`,
      ),
    retry: 2,
    staleTime: 5 * 60_000,
    enabled: !!serviceId,
  });
}

// ── Unread count (for nav badge) ───────────────────────────

export function useUnreadMessageCount() {
  return useQuery<number>({
    queryKey: ["messaging", "unread-count"],
    queryFn: async () => {
      const conversations = await fetchApi<ConversationListItem[]>(
        "/api/messaging/conversations?status=open",
      );
      return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    },
    retry: 2,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
