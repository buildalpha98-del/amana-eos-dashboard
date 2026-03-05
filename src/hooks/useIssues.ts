"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { IssueStatus, IssuePriority } from "@prisma/client";
import { toast } from "@/hooks/useToast";

export interface IssueUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface IssueData {
  id: string;
  title: string;
  description: string | null;
  raisedById: string;
  raisedBy: IssueUser;
  ownerId: string | null;
  owner: IssueUser | null;
  rockId: string | null;
  rock: { id: string; title: string } | null;
  serviceId: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  identifiedAt: string;
  discussedAt: string | null;
  solvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { spawnedTodos: number };
}

export interface IssueDetail extends IssueData {
  spawnedTodos: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; name: string };
  }[];
}

export function useIssues(filters?: {
  status?: string;
  priority?: string;
  ownerId?: string;
  rockId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.ownerId) params.set("ownerId", filters.ownerId);
  if (filters?.rockId) params.set("rockId", filters.rockId);

  const query = params.toString();

  return useQuery<IssueData[]>({
    queryKey: ["issues", filters],
    queryFn: async () => {
      const res = await fetch(`/api/issues${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      return res.json();
    },
  });
}

export function useIssue(id: string) {
  return useQuery<IssueDetail>({
    queryKey: ["issue", id],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${id}`);
      if (!res.ok) throw new Error("Failed to fetch issue");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ownerId?: string | null;
      rockId?: string | null;
      priority?: IssuePriority;
    }) => {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create issue");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast({ description: "Issue created" });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      description?: string | null;
      ownerId?: string | null;
      status?: IssueStatus;
      priority?: IssuePriority;
      rockId?: string | null;
      resolution?: string | null;
    }) => {
      const res = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update issue");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issue"] });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/issues/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast({ description: "Issue deleted" });
    },
  });
}
