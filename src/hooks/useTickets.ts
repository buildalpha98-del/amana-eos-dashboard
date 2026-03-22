"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type {
  TicketStatus,
  TicketPriority,
  MessageDirection,
  MessageDeliveryStatus,
} from "@prisma/client";
import { toast } from "@/hooks/useToast";

export interface TicketContactUser {
  id: string;
  name: string | null;
  parentName: string | null;
  childName: string | null;
  waId: string;
  phoneNumber: string;
}

export interface TicketUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface TicketService {
  id: string;
  name: string;
  code: string;
}

export interface TicketMessageData {
  id: string;
  ticketId: string;
  waMessageId: string | null;
  direction: MessageDirection;
  senderName: string | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  deliveryStatus: MessageDeliveryStatus;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TicketData {
  id: string;
  ticketNumber: number;
  contactId: string;
  contact: TicketContactUser;
  subject: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToId: string | null;
  assignedTo: TicketUser | null;
  serviceId: string | null;
  service: TicketService | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastInboundAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

export interface TicketDetail extends TicketData {
  messages: TicketMessageData[];
}

export function useTickets(filters?: {
  status?: string;
  priority?: string;
  assignedToId?: string;
  serviceId?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.assignedToId) params.set("assignedToId", filters.assignedToId);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.search) params.set("search", filters.search);

  const query = params.toString();

  return useQuery<TicketData[]>({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      return fetchApi<TicketData[]>(`/api/tickets${query ? `?${query}` : ""}`);
    },
    retry: 2,
  });
}

export function useTicket(id: string) {
  return useQuery<TicketDetail>({
    queryKey: ["ticket", id],
    queryFn: async () => {
      return fetchApi<TicketDetail>(`/api/tickets/${id}`);
    },
    enabled: !!id,
    retry: 2,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      contactId: string;
      subject?: string;
      priority?: TicketPriority;
      assignedToId?: string | null;
      serviceId?: string | null;
      tags?: string[];
    }) => {
      return mutateApi<{ id: string }>("/api/tickets", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ description: "Ticket created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      subject?: string | null;
      status?: TicketStatus;
      priority?: TicketPriority;
      assignedToId?: string | null;
      serviceId?: string | null;
      tags?: string[];
    }) => {
      return mutateApi(`/api/tickets/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/tickets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ description: "Ticket deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      body,
    }: {
      ticketId: string;
      body: string;
    }) => {
      return mutateApi(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        body: { body },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ticket", variables.ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["ticket-messages", variables.ticketId],
      });
      toast({ description: "Message sent" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useTicketMessages(ticketId: string) {
  return useQuery<TicketMessageData[]>({
    queryKey: ["ticket-messages", ticketId],
    queryFn: async () => {
      return fetchApi<TicketMessageData[]>(`/api/tickets/${ticketId}/messages`);
    },
    enabled: !!ticketId,
    refetchInterval: 5000,
    retry: 2,
  });
}
