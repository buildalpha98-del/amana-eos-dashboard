"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      const res = await fetch(`/api/tickets${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });
}

export function useTicket(id: string) {
  return useQuery<TicketDetail>({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ description: "Ticket created" });
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
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ description: "Ticket deleted" });
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
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        let errorMessage = "Failed to send message";
        try {
          const err = await res.json();
          errorMessage = err.error || errorMessage;
        } catch {
          errorMessage = `Server error (${res.status})`;
        }
        throw new Error(errorMessage);
      }
      return res.json();
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
  });
}

export function useTicketMessages(ticketId: string) {
  return useQuery<TicketMessageData[]>({
    queryKey: ["ticket-messages", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!ticketId,
    refetchInterval: 5000,
  });
}
