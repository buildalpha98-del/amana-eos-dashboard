"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";

export interface QueueReport {
  id: string;
  seat: string;
  reportType: string;
  title: string;
  content: string;
  metrics: Record<string, unknown> | null;
  alerts: Record<string, unknown> | null;
  serviceCode: string | null;
  status: string;
  assignedToId: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string; code: string } | null;
  assignedTo?: { id: string; name: string; email: string } | null;
}

export interface QueueTodo {
  id: string;
  centreId: string;
  date: string;
  title: string;
  description: string | null;
  category: string;
  dueTime: string | null;
  assignedRole: string | null;
  assignedToId: string | null;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
}

export interface QueueData {
  reports: QueueReport[];
  todos: QueueTodo[];
  counts: { reports: number; todos: number };
}

export function useQueue(filters?: {
  seat?: string;
  serviceCode?: string;
  status?: string;
  view?: "mine" | "all";
}) {
  const params = new URLSearchParams();
  if (filters?.seat) params.set("seat", filters.seat);
  if (filters?.serviceCode) params.set("serviceCode", filters.serviceCode);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.view === "all") params.set("view", "all");

  const query = params.toString();

  return useQuery<QueueData>({
    queryKey: ["queue", filters],
    queryFn: async () => {
      const res = await fetch(`/api/queue${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useReviewReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await fetch(`/api/queue/${reportId}/review`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark as reviewed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-all"] });
      toast({ description: "Report marked as reviewed" });
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });
}

export function useCompleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (todoId: string) => {
      const res = await fetch(`/api/queue/${todoId}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to complete task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["queue-all"] });
      toast({ description: "Task completed" });
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });
}

// Admin: all queues summary
export interface QueueUserSummary {
  user: { id: string; name: string; email: string; role: string; avatar: string | null };
  reports: number;
  todos: number;
  total: number;
}

export interface AllQueuesData {
  queues: QueueUserSummary[];
  unassigned: { reports: number; todos: number };
}

export function useAllQueues() {
  return useQuery<AllQueuesData>({
    queryKey: ["queue-all"],
    queryFn: async () => {
      const res = await fetch("/api/queue/all");
      if (!res.ok) throw new Error("Failed to fetch all queues");
      return res.json();
    },
    staleTime: 30_000,
  });
}
